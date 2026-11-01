/**
 * CSV / TSV files dropped or pasted into the editor become a GFM table at the drop point.
 * Parsing and table building are pure functions; handleDelimitedFiles wires them to the upload placeholder
 * so the async `file.text()` still lands where the user dropped it, even if they keep typing.
 */

import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { reserveUploadSlots } from "@/lib/editor/uploadPlaceholder";
import type { Notify } from "@/lib/editor/commands";
import { t } from "@/i18n/t";

const DELIMITED_MIME = new Set(["text/csv", "text/tab-separated-values"]);

export function isDelimitedFile(file: File): boolean {
  return /\.(csv|tsv)$/i.test(file.name) || DELIMITED_MIME.has(file.type.toLowerCase());
}

const CANDIDATES = [",", "\t", ";"] as const;
/** Rows looked at when sniffing the delimiter */
const SNIFF_ROWS = 10;

const isEmptyRow = (row: string[]) => row.every((cell) => cell === "");

/** RFC 4180 parse with a fixed delimiter. maxRows stops early (used by the sniffer) */
function parseWith(text: string, delim: string, maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };
  while (i < text.length && rows.length < maxRows) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += c;
    }
    i++;
  }
  // The last line without a trailing newline (or with content pending) still counts as a row
  if (rows.length < maxRows && (field !== "" || row.length > 0 || quoted)) endRow();
  return rows;
}

/** Delimiter whose sample rows agree most on a column count above 1; comma wins ties */
function sniffDelimiter(text: string): string {
  let best: string = ",";
  let bestScore = 0;
  for (const delim of CANDIDATES) {
    const sample = parseWith(text, delim, SNIFF_ROWS * 4)
      .filter((row) => !isEmptyRow(row))
      .slice(0, SNIFF_ROWS);
    if (sample.length === 0) continue;
    const counts = new Map<number, number>();
    for (const row of sample) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    let score = 0;
    for (const [cols, n] of counts) if (cols > 1 && n > score) score = n;
    if (score > bestScore) {
      best = delim;
      bestScore = score;
    }
  }
  return best;
}

export function parseDelimited(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = parseWith(body, sniffDelimiter(body));
  while (rows.length > 0 && isEmptyRow(rows[rows.length - 1])) rows.pop();
  return rows;
}

const cellText = (cell: string) =>
  cell
    .trim()
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, "<br>");

export function rowsToMarkdownTable(rows: string[][]): string | null {
  if (rows.length === 0) return null;
  const header = rows[0].map(cellText);
  if (header.every((cell) => cell === "")) return null;
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) => {
    const padded = Array.from({ length: width }, (_, i) => cells[i] ?? "");
    return `| ${padded.join(" | ")} |`;
  };
  return [
    line(header),
    line(Array.from({ length: width }, () => "---")),
    ...rows.slice(1).map((row) => line(row.map(cellText))),
  ].join("\n");
}

/** Pad the table so it sits on its own lines with blank lines around it:
 *  without them a preceding paragraph would swallow the header, and a following line would become a table row */
export function padTableBlock(table: string, at: number, state: EditorState): string {
  const line = state.doc.lineAt(at);
  const before = state.sliceDoc(line.from, at);
  const after = state.sliceDoc(at, line.to);
  let prefix = "";
  if (at !== line.from) {
    prefix = before.trim() ? "\n\n" : "\n";
  } else if (line.number > 1 && state.doc.line(line.number - 1).text.trim()) {
    prefix = "\n";
  }
  const suffix = after.trim() ? "\n\n" : "\n";
  return prefix + table + suffix;
}

/** Import the CSV / TSV files among `files` as tables at `at` (default: cursor). False if there were none */
export function handleDelimitedFiles(
  view: EditorView,
  files: FileList | File[],
  notify: Notify,
  at?: number
): boolean {
  const tables = Array.from(files).filter(isDelimitedFile);
  if (tables.length === 0) return false;
  const pos = at ?? view.state.selection.main.head;
  const slots = reserveUploadSlots(
    view,
    pos,
    tables.map((f) => f.name || t("未命名文件"))
  );
  // Reads run in parallel, insertions in file order (same queue as handleMediaFiles)
  let queue = Promise.resolve();
  tables.forEach((file, i) => {
    const reading = file.text().then(
      (text) => rowsToMarkdownTable(parseDelimited(text)),
      () => undefined
    );
    queue = queue
      .then(() => reading)
      .then((table) => {
        if (table === undefined) {
          notify(t("「{name}」读取失败", { name: file.name }), "error");
          return slots[i].cancel();
        }
        if (table === null) {
          notify(t("「{name}」里没有读到表格数据", { name: file.name }), "error");
          return slots[i].cancel();
        }
        if (!slots[i].resolve((target, state) => padTableBlock(table, target, state)))
          notify(t("「{name}」的插入位置已被删掉，没有插入", { name: file.name }), "info");
      })
      .catch(() => slots[i].cancel());
  });
  return true;
}
