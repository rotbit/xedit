/** Public type contract of the editor: selection snapshot and imperative handle, used by the floating toolbar and views. */

import type { EditorView } from "@codemirror/view";
import type { FormatCommand } from "@/lib/editor/commands";

/** Selection snapshot: the floating toolbar uses it to decide show/hide and placement */
export interface SelectionInfo {
  from: number;
  to: number;
  empty: boolean;
  /** Whether the editor currently has focus (blur hides the toolbar, unless focus moved to the toolbar itself) */
  hasFocus: boolean;
  /** Whether this report came with a document change (typing hides the toolbar) */
  docChanged: boolean;
}

export interface EditorHandle {
  /** Flush the last input before switching to reading mode, without triggering a version save. */
  flush: () => void;
  /** arg: color value for the color command (omitted = clear color); ignored by other commands */
  applyFormat: (cmd: FormatCommand, arg?: string) => void;
  view: () => EditorView | null;
  /** Jump to a given line (0-based): move the cursor and smooth-scroll; used by outline clicks */
  scrollToLine: (line: number) => void;
  /** Only scroll a line to the top of the container, without moving the cursor or stealing focus (preview → editor scroll sync) */
  scrollLineToTop: (line: number) => void;
}
