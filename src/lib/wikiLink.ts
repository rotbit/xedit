/**
 * Obsidian 式 `[[双向链接]]` 的纯解析层：编辑器、预览、改名重链共用同一套口径。
 *
 * 按「标题」解析而不是 id：与 Obsidian 一致，链接写的是人读得懂的标题，
 * 不依赖数据库主键，导出成 .md 后在别的工具里仍然成立。
 * 代价是重名标题只能命中第一篇 —— 这是 Obsidian 同样的取舍。
 */

export interface WikiLinkRef {
  /** 目标文章标题（两端已 trim） */
  target: string;
  /** `[[目标|别名]]` 里的别名，没写则为 undefined */
  alias?: string;
  /** 在原文中的区间，含首尾的 `[[` `]]` */
  from: number;
  to: number;
}

/**
 * 代码区间：围栏块与行内代码里的 `[[…]]` 是代码不是链接。
 * 逐行扫而不是写一条大正则：围栏的开闭配对本来就是行状态机，
 * 正则写法在「未闭合围栏」「~~~ 与 ``` 混用」上很容易出错。
 */
export function codeRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fenceFrom = -1;
  let fenceMark = "";
  let pos = 0;
  for (const line of content.split("\n")) {
    const fence = /^(`{3,}|~{3,})/.exec(line.trim())?.[1];
    if (fenceFrom >= 0) {
      // 围栏内：只有同种、且不短于开栏的标记才收口，其余整行都算代码
      if (fence && fence[0] === fenceMark[0] && fence.length >= fenceMark.length) {
        ranges.push([fenceFrom, pos + line.length]);
        fenceFrom = -1;
      }
    } else if (fence) {
      fenceFrom = pos;
      fenceMark = fence;
    } else {
      // 行内代码只认成对反引号，落单的一个反引号不构成代码
      const inline = /`[^`]*`/g;
      let m: RegExpExecArray | null;
      while ((m = inline.exec(line))) ranges.push([pos + m.index, pos + m.index + m[0].length]);
    }
    pos += line.length + 1; // +1 是被 split 吃掉的换行
  }
  if (fenceFrom >= 0) ranges.push([fenceFrom, content.length]); // 未闭合的围栏吃到文末
  return ranges;
}

/** 扫描全文里的 `[[目标]]` / `[[目标|显示文字]]`，跳过代码、忽略空目标 */
export function parseWikiLinks(content: string): WikiLinkRef[] {
  const skip = codeRanges(content);
  const re = /\[\[([^[\]\r\n]+)\]\]/g; // 不跨行、不允许嵌套 [[，与编辑器侧 lezer 扩展同规则
  const out: WikiLinkRef[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const from = m.index;
    if (skip.some(([s, e]) => from >= s && from < e)) continue;
    const bar = m[1].indexOf("|");
    const target = (bar === -1 ? m[1] : m[1].slice(0, bar)).trim();
    if (!target) continue;
    const alias = bar === -1 ? undefined : m[1].slice(bar + 1).trim() || undefined;
    out.push({ target, alias, from, to: from + m[0].length });
  }
  return out;
}

/** 链接呈现出来的文字：有别名用别名，没有就用目标标题 */
export function wikiLinkText(target: string, alias?: string): string {
  return alias?.trim() || target.trim();
}

/** 标题的比较口径：trim + 忽略大小写（与 Obsidian 的按标题解析一致） */
export function normalizeTitle(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * 点开一个双向链接的请求。编辑器与预览都只是渲染层，不认识文库，
 * 因此用一条自定义事件把「按标题找文章」的活交给应用层（见 useWikiLinkOpen）。
 */
export const WIKI_OPEN_EVENT = "xedit:open-wikilink";

export function requestOpenWikiLink(target: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WIKI_OPEN_EVENT, { detail: { target } }));
}
