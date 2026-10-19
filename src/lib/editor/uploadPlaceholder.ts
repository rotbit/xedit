/**
 * Positional placeholder for media uploads.
 *
 * The old approach was "upload first, insert at the cursor when done", so: if the user kept typing during the wait, the image
 * landed in the middle of the new text; when pasting several at once, whichever finished first was inserted first, so order depended on
 * network speed; and on failure nothing appeared at all, leaving the user wondering where the image went.
 *
 * Now, at the moment of paste/drop, we pin an "uploading" badge at the drop point, and when the upload returns we insert the final Markdown
 * wherever the badge currently is. The badge is a widget decoration in a StateField,
 * not document text, so:
 * - its position is mapped through subsequent edits, so typing/deleting never misplaces the image;
 * - autosave and export always see the real text, so a fake `uploading:` URL can never be written into the document;
 * - decorations are added/removed only via effects and stay out of history, so undo won't resurrect a badge that's already gone.
 */

import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { MapMode, StateEffect, StateField, type Extension } from "@codemirror/state";
import { t } from "@/i18n/t";

/** A pending placeholder: the id is used to find itself again in the mapped decoration set */
interface Slot {
  id: number;
  pos: number;
  name: string;
}

const addChip = StateEffect.define<Slot>();
const dropChip = StateEffect.define<number>();

let nextId = 1;

/** File name on the badge: middle-truncated keeping the extension, so long screenshot names don't wrap the badge */
export function shortenFileName(name: string, max = 24): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(4, max - ext.length - 1);
  const head = Math.ceil(keep * 0.6);
  const tail = Math.floor(keep * 0.4);
  return `${base.slice(0, head)}…${base.slice(base.length - tail)}${ext}`;
}

const IMAGE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="M14 11l-3.2-3.2a1 1 0 0 0-1.4 0L4 13"/></svg>';
const VIDEO_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="2" y="3.5" width="9" height="9" rx="2"/><path d="M11 7l3-2v6l-3-2z"/></svg>';

const isVideoName = (name: string) => /\.(mp4|webm|mov|m4v)$/i.test(name);

/** Badge at the drop point: icon + file name + 「上传中…」 (Uploading…), with a slow shimmer to show it's busy.
 *  eq compares only id: when the same badge is repositioned the DOM isn't rebuilt, so the animation isn't interrupted */
class UploadChipWidget extends WidgetType {
  constructor(
    readonly id: number,
    readonly name: string
  ) {
    super();
  }
  eq(other: UploadChipWidget) {
    return other.id === this.id;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-upload-chip";
    wrap.setAttribute("aria-label", t("正在上传 {name}", { name: this.name }));
    const icon = document.createElement("span");
    icon.className = "cm-upload-chip-icon";
    icon.innerHTML = isVideoName(this.name) ? VIDEO_ICON : IMAGE_ICON;
    const label = document.createElement("span");
    label.className = "cm-upload-chip-name";
    label.textContent = shortenFileName(this.name);
    label.title = this.name;
    const status = document.createElement("span");
    status.className = "cm-upload-chip-status";
    status.textContent = t("上传中");
    wrap.append(icon, label, status);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

interface ChipState {
  readonly slots: readonly Slot[];
  readonly decos: DecorationSet;
}

/** Multiple badges at the same position all use side=1 (drawn after the cursor); their order comes from array order —
 *  Decoration.set sorts stably, so array order is the order the user picked the files */
function buildDecos(slots: readonly Slot[]): DecorationSet {
  return Decoration.set(
    slots.map((s) =>
      Decoration.widget({ widget: new UploadChipWidget(s.id, s.name), side: 1 }).range(s.pos)
    ),
    true
  );
}

const EMPTY: ChipState = { slots: [], decos: Decoration.none };

const chipField = StateField.define<ChipState>({
  create: () => EMPTY,
  update(value, tr) {
    let slots = value.slots;
    let changed = false;
    if (tr.docChanged && slots.length > 0) {
      const mapped: Slot[] = [];
      for (const slot of slots) {
        // assoc=1: the badge sits to the right of the cursor, so when the user keeps typing in place it moves after the new text,
        // and the final image won't split what was just typed in half.
        // TrackDel: if the whole drop point is deleted this returns null and that image is simply not inserted (see UploadSlot.resolve)
        const pos = tr.changes.mapPos(slot.pos, 1, MapMode.TrackDel);
        if (pos === null) {
          changed = true;
          continue;
        }
        if (pos !== slot.pos) changed = true;
        mapped.push(pos === slot.pos ? slot : { ...slot, pos });
      }
      slots = mapped;
    }
    for (const effect of tr.effects) {
      if (effect.is(addChip)) {
        slots = [...slots, effect.value];
        changed = true;
      } else if (effect.is(dropChip)) {
        const rest = slots.filter((s) => s.id !== effect.value);
        if (rest.length !== slots.length) {
          slots = rest;
          changed = true;
        }
      }
    }
    return changed ? { slots, decos: buildDecos(slots) } : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decos),
});

const chipTheme = EditorView.baseTheme({
  ".cm-upload-chip": {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    margin: "0 3px",
    padding: "0 10px 0 7px",
    height: "24px",
    maxWidth: "260px",
    borderRadius: "999px",
    border: "1px solid var(--hairline)",
    // A faint light sweeps between two paper-gray tones: quieter than a spinner, yet clearly "still uploading"
    background:
      "linear-gradient(100deg, var(--sidebar) 35%, var(--accent-wash) 50%, var(--sidebar) 65%) 0 0 / 250% 100%",
    animation: "cm-upload-chip-shimmer 1.6s linear infinite",
    color: "var(--ink-soft)",
    fontSize: "12px",
    lineHeight: "1",
    whiteSpace: "nowrap",
    verticalAlign: "-6px",
    userSelect: "none",
  },
  ".cm-upload-chip-icon": {
    display: "inline-flex",
    width: "13px",
    height: "13px",
    flex: "none",
    color: "var(--ink-faint)",
  },
  ".cm-upload-chip-icon svg": { width: "100%", height: "100%" },
  ".cm-upload-chip-name": { overflow: "hidden", textOverflow: "ellipsis" },
  ".cm-upload-chip-status": { color: "var(--ink-faint)" },
  ".cm-upload-chip-status::after": {
    content: '""',
    display: "inline-block",
    width: "1.2em",
    textAlign: "left",
    animation: "cm-upload-chip-dots 1.2s steps(4) infinite",
  },
  "@keyframes cm-upload-chip-shimmer": {
    from: { backgroundPosition: "100% 0" },
    to: { backgroundPosition: "-100% 0" },
  },
  "@keyframes cm-upload-chip-dots": {
    "0%": { content: '""' },
    "25%": { content: '"."' },
    "50%": { content: '".."' },
    "75%": { content: '"..."' },
  },
});

/** Insertion handle after an upload completes, one per file */
export interface UploadSlot {
  /** Success: insert the Markdown wherever the badge currently is and remove the badge.
   *  Returns false if the drop point was deleted by the user (or the document was switched); nothing is inserted */
  resolve(markdown: string): boolean;
  /** Failure/cancel: remove the badge only, leave the text untouched */
  cancel(): void;
}

function livePos(view: EditorView, id: number): number | null {
  const slot = view.state.field(chipField, false)?.slots.find((s) => s.id === id);
  return slot ? slot.pos : null;
}

/**
 * Pin a series of "uploading" badges at `at` in order, returning insertion handles matching `names` one-to-one.
 * The caller must make the resolves happen in file order (uploads can run in parallel, insertion must be queued).
 */
export function reserveUploadSlots(view: EditorView, at: number, names: string[]): UploadSlot[] {
  // Without the extension installed, fall back to "insert at the registered position": no longer follows edits, but at least nothing is lost
  const installed = view.state.field(chipField, false) !== undefined;
  const pos = Math.max(0, Math.min(at, view.state.doc.length));
  const slots: Slot[] = names.map((name) => ({ id: nextId++, pos, name }));
  if (installed) view.dispatch({ effects: slots.map((slot) => addChip.of(slot)) });
  return slots.map((slot) => ({
    resolve(markdown: string) {
      const target = installed ? livePos(view, slot.id) : Math.min(slot.pos, view.state.doc.length);
      if (target === null) return false;
      view.dispatch({
        changes: { from: target, insert: markdown },
        effects: installed ? dropChip.of(slot.id) : [],
      });
      return true;
    },
    cancel() {
      if (installed) view.dispatch({ effects: dropChip.of(slot.id) });
    },
  }));
}

export const uploadPlaceholders: Extension = [chipField, chipTheme];
