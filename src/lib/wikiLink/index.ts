/**
 * Pure parsing layer for Obsidian-style `[[wiki links]]`: the editor, preview and rename-relinking share the same rules.
 *
 * Resolved by title rather than id: like Obsidian, links use human-readable titles,
 * don't depend on database keys, and still work in other tools after exporting to .md.
 * The cost is that duplicate titles only hit the first doc — the same trade-off Obsidian makes.
 */

export interface WikiLinkRef {
  /** Target article title (trimmed at both ends) */
  target: string;
  /** Alias in `[[target|alias]]`; undefined if absent */
  alias?: string;
  /** Range in the source, including the surrounding `[[` `]]` */
  from: number;
  to: number;
}

/**
 * Code ranges: `[[…]]` inside fenced blocks and inline code is code, not a link.
 * Scan line by line rather than one big regex: fence open/close pairing is inherently a line state machine,
 * and regexes easily get "unclosed fences" and "mixed ~~~ and ```" wrong.
 */
export function codeRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fenceFrom = -1;
  let fenceMark = "";
  let pos = 0;
  for (const line of content.split("\n")) {
    const fence = /^(`{3,}|~{3,})/.exec(line.trim())?.[1];
    if (fenceFrom >= 0) {
      // Inside a fence: only a marker of the same kind and no shorter than the opener closes it; every other line is code
      if (fence && fence[0] === fenceMark[0] && fence.length >= fenceMark.length) {
        ranges.push([fenceFrom, pos + line.length]);
        fenceFrom = -1;
      }
    } else if (fence) {
      fenceFrom = pos;
      fenceMark = fence;
    } else {
      // Inline code only counts paired backticks; a lone backtick isn't code
      const inline = /`[^`]*`/g;
      let m: RegExpExecArray | null;
      while ((m = inline.exec(line))) ranges.push([pos + m.index, pos + m.index + m[0].length]);
    }
    pos += line.length + 1; // +1 for the newline eaten by split
  }
  if (fenceFrom >= 0) ranges.push([fenceFrom, content.length]); // An unclosed fence runs to the end of the document
  return ranges;
}

/** Scan the full text for `[[target]]` / `[[target|display text]]`, skipping code and ignoring empty targets */
export function parseWikiLinks(content: string): WikiLinkRef[] {
  const skip = codeRanges(content);
  const re = /\[\[([^[\]\r\n]+)\]\]/g; // No line breaks, no nested [[ — same rules as the editor's lezer extension
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

/** Text the link renders as: the alias if present, otherwise the target title */
export function wikiLinkText(target: string, alias?: string): string {
  return alias?.trim() || target.trim();
}

/** Title comparison rule: trim + case-insensitive (matches Obsidian's title resolution) */
export function normalizeTitle(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Request to open a wiki link. The editor and preview are only render layers and don't know the library,
 * so a custom event hands "find the article by title" to the app layer (see useWikiLinkOpen).
 */
export const WIKI_OPEN_EVENT = "xedit:open-wikilink";

export function requestOpenWikiLink(target: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WIKI_OPEN_EVENT, { detail: { target } }));
}
