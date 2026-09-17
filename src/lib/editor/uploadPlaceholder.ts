/**
 * 媒体上传的位置占位。
 *
 * 老做法是「先上传、传完再往光标处插」，于是：等的这几秒里用户接着打字，图片就插进了
 * 刚敲的字中间；一次粘多张，谁先传完谁先落笔，正文顺序全凭网速；传失败则正文里什么
 * 都没有，用户不知道刚才那张去哪了。
 *
 * 现在改成粘贴/拖入的那一刻先在落点挂一枚「上传中」的小牌子，上传回来再把最终 Markdown
 * 插到小牌子当下所在的位置。小牌子是 StateField 里的部件装饰（widget decoration），
 * 不是正文文本，因此：
 * - 位置随后续编辑一起映射，用户接着打字/删字都不会把图片插错地方；
 * - 自动保存与导出看到的永远是真正文，不可能把 `uploading:` 这种假地址写进文档；
 * - 装饰只由 effect 增删，不进历史，撤销不会把已经消失的小牌子招回来。
 */

import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { MapMode, StateEffect, StateField, type Extension } from "@codemirror/state";

/** 一枚待落笔的占位：id 用来在映射后的装饰集合里找回自己 */
interface Slot {
  id: number;
  pos: number;
  name: string;
}

const addChip = StateEffect.define<Slot>();
const dropChip = StateEffect.define<number>();

let nextId = 1;

/** 转圈的小牌子。eq 只比 id：同一枚牌子重排位置时不重建 DOM，动画不会被打断 */
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
    wrap.setAttribute("aria-label", `正在上传 ${this.name}`);
    const spin = document.createElement("span");
    spin.className = "cm-upload-chip-spin";
    const label = document.createElement("span");
    label.textContent = `上传中 ${this.name}`;
    wrap.append(spin, label);
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

/** 同位置的多枚牌子一律 side=1（画在光标之后），先后顺序交给数组顺序——
 *  Decoration.set 的排序是稳定的，数组顺序即用户选文件的顺序 */
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
        // assoc=1：牌子画在光标右边，用户在原地继续打字时它得跟着挪到新字后面，
        // 最终插进来的图片才不会把这段刚敲的字劈成两半。
        // TrackDel：落点整段被删掉就返回 null，这一张干脆不插（见 UploadSlot.resolve）
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
    margin: "0 2px",
    padding: "1px 8px",
    borderRadius: "6px",
    background: "var(--accent-wash)",
    color: "var(--ink-faint)",
    fontSize: "12px",
    verticalAlign: "baseline",
    userSelect: "none",
  },
  ".cm-upload-chip-spin": {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    border: "1.5px solid var(--hairline-strong)",
    borderTopColor: "var(--ink-faint)",
    animation: "cm-upload-chip-spin 0.7s linear infinite",
  },
  "@keyframes cm-upload-chip-spin": {
    "0%": { transform: "rotate(0deg)" },
    "100%": { transform: "rotate(360deg)" },
  },
});

/** 上传完成后的落笔句柄，一个文件一枚 */
export interface UploadSlot {
  /** 传成功：把 Markdown 插到牌子当下所在的位置并撤牌。
   *  返回 false 表示落点已被用户删掉（或已切走文档），这一张没有插入 */
  resolve(markdown: string): boolean;
  /** 传失败/取消：只撤牌，正文不动 */
  cancel(): void;
}

function livePos(view: EditorView, id: number): number | null {
  const slot = view.state.field(chipField, false)?.slots.find((s) => s.id === id);
  return slot ? slot.pos : null;
}

/**
 * 在 `at` 处按顺序挂上一串「上传中」小牌子，返回与 names 一一对应的落笔句柄。
 * 调用方负责让 resolve 按文件顺序依次发生（上传可以并行，落笔必须排队）。
 */
export function reserveUploadSlots(view: EditorView, at: number, names: string[]): UploadSlot[] {
  // 扩展没装上时退化成「按登记位置插入」：位置不再跟随编辑，但至少不会把内容丢掉
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
