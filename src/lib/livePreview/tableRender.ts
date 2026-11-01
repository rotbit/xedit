import MarkdownIt from "markdown-it";
import { intrawordStarPlugin } from "@/lib/markdown/intrawordStar";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { parseAlign, type Align } from "@/lib/editor/tableOps";

/** Parsing a table widget's source into cells, and rendering one cell's Markdown. All HTML written to the DOM
 *  goes through DOMPurify first (sanitizeHtml). */

/** Cells run inline rendering only: block rules would wrap a cell's content in <p> again and blow up row height.
 *  The instance is created lazily once and reused across every editor relayout */
let inlineMd: MarkdownIt | null = null;
export function renderCell(source: string): string {
  if (!inlineMd) inlineMd = new MarkdownIt({ html: false }).use(intrawordStarPlugin);
  // Raw HTML stays off, but `<br>` is the only way to break a line inside a pipe-table cell (Shift-Enter inserts it),
  // so that one tag is let through as a real line break (not inside inline code, where it is literal text)
  const html = inlineMd
    .renderInline(source)
    .split(/(<code>[\s\S]*?<\/code>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/&lt;br\s*\/?&gt;/gi, "<br>")))
    .join("");
  return sanitizeHtml(html);
}

export interface ParsedCell {
  /** Trimmed cell source (escapes kept) */
  text: string;
  /** Offset of the cell's text from the table start; write-back resolves the cell from it */
  offset: number;
}

export interface ParsedTable {
  /** By source line: index 0 is the header, 1 the delimiter row */
  rows: ParsedCell[][];
  aligns: Align[];
}

/** Split a row on unescaped pipes, keeping each cell's offset within the line; escaping is left to Markdown rendering. */
function splitRow(line: string): { text: string; from: number }[] {
  const cells: { text: string; from: number }[] = [];
  let start = 0;
  const addCell = (end: number) => {
    const raw = line.slice(start, end);
    cells.push({ text: raw.trim(), from: start + raw.length - raw.trimStart().length });
    start = end + 1;
  };
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === "|") addCell(i);
  }
  addCell(line.length);
  if (line.trimStart().startsWith("|")) cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].text === "" && line.trimEnd().endsWith("|")) cells.pop();
  return cells;
}

export function parseTableSource(source: string): ParsedTable {
  let lineOffset = 0;
  const rows = source.split("\n").map((line) => {
    const rowOffset = lineOffset;
    lineOffset += line.length + 1;
    return splitRow(line).map((cell) => ({ text: cell.text, offset: rowOffset + cell.from }));
  });
  const aligns = (rows[1] ?? []).map((cell) => parseAlign(cell.text));
  return { rows, aligns };
}

