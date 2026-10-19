/**
 * Pure parsing layer for YAML frontmatter: editor, preview, and export share the same rules.
 *
 * Only minimal YAML is supported (`key: value` / `key: [a, b]` / `key:` + `- x` lists) rather than pulling in a YAML library:
 * frontmatter in WeChat articles is just a few lines like title, author, date;
 * a parser would add tens of KB to the bundle and bring along anchors, aliases, and other syntax nobody writes.
 */

export interface Frontmatter {
  /** Parsed key-values; both array and list forms are normalized to string[] */
  data: Record<string, string | string[]>;
  /** Body after the frontmatter */
  body: string;
  /** Offset where the frontmatter ends (including the closing `---` line and its newline) */
  end: number;
}

/** Delimiter line: only a standalone `---` (trailing spaces are fine) */
const FENCE = /^---[ \t]*$/;

/** Strip matching quotes around a value */
function unquote(value: string): string {
  const m = /^(["'])([\s\S]*)\1$/.exec(value);
  return m ? m[2] : value;
}

/** Minimal YAML: only top-level `key: value` / `key: [a, b]` / `key:` + `- x`; other lines are ignored */
function parseEntries(lines: string[]): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // blank lines and comments

    // `- x`: belongs to the previous empty-valued key; if no list follows `key:`, it stays an empty string
    if (listKey && /^-(\s|$)/.test(trimmed)) {
      const value = unquote(trimmed.slice(1).trim());
      if (value) {
        const bucket = data[listKey];
        if (Array.isArray(bucket)) bucket.push(value);
        else data[listKey] = [value];
      }
      continue;
    }

    if (/^\s/.test(line)) continue; // indented non-list line = nested structure, unsupported
    const at = line.indexOf(":");
    const key = at > 0 ? line.slice(0, at).trim() : "";
    if (!key) continue;

    const value = line.slice(at + 1).trim();
    if (!value) {
      data[key] = "";
      listKey = key; // wait for the following `- x`
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

/** Parse frontmatter at the very start of the document; returns null if it doesn't start with `---` or has no closing `---` */
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
  for (let i = 0; i <= close; i++) end += lines[i].length + 1; // +1 for the newline consumed by split
  end = Math.min(end, md.length); // no trailing newline when the closing `---` is at the end of the doc
  return { data: parseEntries(lines.slice(1, close)), body: md.slice(end), end };
}

/** Strip frontmatter, keeping only the body; returned as-is when there's no frontmatter */
export function stripFrontmatter(md: string): string {
  return parseFrontmatter(md)?.body ?? md;
}

/**
 * Set / delete a top-level scalar key (value null = delete); other lines are preserved as-is.
 * Creates frontmatter at the top if there is none; if deletion leaves an empty shell, removes the whole frontmatter block.
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
    // If this key used list form, replace it along with its `- x` / indented lines
    let span = 1;
    while (at + span < inner.length && /^(\s|-(\s|$))/.test(inner[at + span])) span++;
    inner.splice(at, span, ...(value === null ? [] : [`${key}: ${value}`]));
  }
  if (inner.every((l) => !l.trim())) return fm.body.replace(/^\n+/, "");
  return `---\n${inner.join("\n")}\n---\n${fm.body}`;
}
