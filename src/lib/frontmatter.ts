/**
 * YAML frontmatter 的纯解析层：编辑器、预览、导出共用同一套口径。
 *
 * 只认极简 YAML（`key: 值` / `key: [a, b]` / `key:` + `- x` 列表）而不引一个 YAML 库：
 * 公众号写作用到的 frontmatter 就是标题、作者、日期这几行，
 * 引一个解析器要多打包几十 KB，还会把锚点、别名这些谁也不写的语法一起带进来。
 */

export interface Frontmatter {
  /** 解析出的键值；数组写法与列表写法都归一成 string[] */
  data: Record<string, string | string[]>;
  /** frontmatter 之后的正文 */
  body: string;
  /** frontmatter 结束处的偏移（含收尾 `---` 行及其换行） */
  end: number;
}

/** 起止分隔行：只认单独成行的 `---`（尾随空格无所谓） */
const FENCE = /^---[ \t]*$/;

/** 去掉值两侧成对的引号 */
function unquote(value: string): string {
  const m = /^(["'])([\s\S]*)\1$/.exec(value);
  return m ? m[2] : value;
}

/** 极简 YAML：只处理顶层 `key: 值` / `key: [a, b]` / `key:` + `- x`，其余整行忽略 */
function parseEntries(lines: string[]): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // 空行与注释

    // `- x`：归到上一个空值键下；`key:` 后没跟列表就保持空串
    if (listKey && /^-(\s|$)/.test(trimmed)) {
      const value = unquote(trimmed.slice(1).trim());
      if (value) {
        const bucket = data[listKey];
        if (Array.isArray(bucket)) bucket.push(value);
        else data[listKey] = [value];
      }
      continue;
    }

    if (/^\s/.test(line)) continue; // 缩进的非列表行＝嵌套结构，不支持
    const at = line.indexOf(":");
    const key = at > 0 ? line.slice(0, at).trim() : "";
    if (!key) continue;

    const value = line.slice(at + 1).trim();
    if (!value) {
      data[key] = "";
      listKey = key; // 等着后面的 `- x`
      continue;
    }
    listKey = null;
    const inline = /^\[([\s\S]*)\]$/.exec(value);
    data[key] = inline
      ? inline[1]
          .split(",")
          .map((item) => unquote(item.trim()))
          .filter(Boolean)
      : unquote(value);
  }
  return data;
}

/** 解析文档最开头的 frontmatter；不是以 `---` 开头、或没有收尾 `---` 都返回 null */
export function parseFrontmatter(md: string): Frontmatter | null {
  if (!md.startsWith("---")) return null;
  const lines = md.split("\n");
  if (!FENCE.test(lines[0].replace(/\r$/, ""))) return null;

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i].replace(/\r$/, ""))) {
      close = i;
      break;
    }
  }
  if (close === -1) return null;

  let end = 0;
  for (let i = 0; i <= close; i++) end += lines[i].length + 1; // +1 是被 split 吃掉的换行
  end = Math.min(end, md.length); // 收尾 `---` 就是文末时没有那个换行
  return { data: parseEntries(lines.slice(1, close)), body: md.slice(end), end };
}

/** 去掉 frontmatter，只留正文；没有 frontmatter 时原样返回 */
export function stripFrontmatter(md: string): string {
  return parseFrontmatter(md)?.body ?? md;
}

/**
 * 写入 / 删除一个顶层标量键（value 传 null = 删除），其余行原样保留。
 * 没有 frontmatter 时在文首新建；删完只剩空壳就把整块 frontmatter 一起拿掉。
 */
export function setFrontmatterValue(md: string, key: string, value: string | null): string {
  const fm = parseFrontmatter(md);
  if (!fm) return value === null ? md : `---\n${key}: ${value}\n---\n\n${md}`;

  const lines = md.slice(0, fm.end).replace(/\n$/, "").split("\n");
  const inner = lines.slice(1, -1);
  const at = inner.findIndex((l) => !/^\s/.test(l) && l.slice(0, Math.max(0, l.indexOf(":"))).trim() === key);
  if (at === -1) {
    if (value === null) return md;
    inner.push(`${key}: ${value}`);
  } else {
    // 这个键原来若是列表写法，连同它名下的 `- x` / 缩进行一起换掉
    let span = 1;
    while (at + span < inner.length && /^(\s|-(\s|$))/.test(inner[at + span])) span++;
    inner.splice(at, span, ...(value === null ? [] : [`${key}: ${value}`]));
  }
  if (inner.every((l) => !l.trim())) return fm.body.replace(/^\n+/, "");
  return `---\n${inner.join("\n")}\n---\n${fm.body}`;
}
