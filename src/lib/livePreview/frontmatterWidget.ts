import { EditorView, WidgetType } from "@codemirror/view";
import { parseFrontmatter } from "@/lib/frontmatter";
import { editOnClick } from "@/lib/livePreview/widgetUtils";
import { ATTACHMENTS_RESOLVED_EVENT, isAttachmentSrc, resolveAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { t } from "@/i18n/t";

/**
 * Live-render widget for leading YAML frontmatter: a read-only metadata card.
 *
 * Not hidden, nor dressed up as part of the body — frontmatter is metadata for machines,
 * and a two-column "key value" card draws a clear line between it and the body (same idea as Obsidian's properties panel).
 * Entering the range with the cursor restores the source (decided in blocks.ts), so the card needn't be editable. The exception is cover-only frontmatter: it always renders as an image.
 *
 * The DOM is built entirely with textContent, no innerHTML anywhere: frontmatter may contain any characters,
 * so this path needs no extra pass through DOMPurify.
 */

/** Height of one card row: 13px font × 1.7 line height ≈ 22px (see .cm-lp-fm in live-frontmatter.css) */
const FM_ROW_HEIGHT = 22;

/** `cover:` shows no URL and renders directly as a 2.35:1 image (WeChat headline cover ratio); COVER_HEIGHT is the image height estimated at single-column body width (~704px) plus top/bottom spacing, see live-frontmatter.css */
const COVER_KEY = "cover";
const COVER_HEIGHT = 335;

/** Clicking the card puts the cursor on the second line (after `---\n`): it must land strictly inside the range to restore source */
const FM_CARET_OFFSET = 4;

/**
 * Whether the frontmatter contains only `cover:`. Such frontmatter is written by the 「封面」 (Cover) picker,
 * and is changed back in the picker; the source (a long image URL) has nothing to see or edit — so the cursor touching it doesn't restore source,
 * it always stays rendered as an image (decided in blocks.ts). With other fields present, clicking opens it for editing as usual.
 */
let lastCoverOnly: { source: string; result: boolean } | null = null;
export function isCoverOnlyFrontmatter(source: string): boolean {
  if (lastCoverOnly?.source === source) return lastCoverOnly.result;
  const data = parseFrontmatter(source)?.data ?? {};
  const keys = Object.keys(data);
  const result = keys.length === 1 && keys[0] === COVER_KEY && typeof data[COVER_KEY] === "string" && data[COVER_KEY] !== "";
  lastCoverOnly = { source, result };
  return result;
}

/** Cover: a 2.35:1 header image as wide as the body (WeChat headline cover ratio), sitting at the top of the body like an article's hero image */
function coverBlock(src: string): HTMLElement {
  const block = document.createElement("div");
  block.className = "cm-lp-fm-cover";
  const img = document.createElement("img");
  img.alt = "";
  // Images in a disk library are read asynchronously: leave it empty until loaded. The widget won't rebuild while the source is unchanged (see eq), so it fills itself in once read
  img.src = isAttachmentSrc(src) ? (resolveAttachmentSrc(src) ?? "") : src;
  if (!img.getAttribute("src")) {
    const onResolved = () => {
      const url = resolveAttachmentSrc(src);
      if (!url && img.isConnected) return;
      window.removeEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
      if (url) img.src = url;
    };
    window.addEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
  }
  // Only a small badge on the image says what it is; how to change it lives in the hover tooltip, taking no space
  const frame = document.createElement("div");
  frame.className = "cm-lp-fm-cover-frame";
  frame.title = t("发送到公众号时自动设置；在标题下方的「封面」里更换");
  const badge = document.createElement("span");
  badge.className = "cm-lp-fm-cover-badge";
  badge.textContent = t("封面");
  frame.append(img, badge);
  block.appendChild(frame);
  return block;
}

export class FrontmatterWidget extends WidgetType {
  /** Parse once at construction: a changed source is a different widget (see eq); toDOM only builds the DOM */
  private readonly fields: { key: string; value: string }[];
  private readonly lineCount: number;

  constructor(readonly source: string) {
    super();
    // All keys are treated alike: list values are joined with 「、」, everything else is shown as-is
    this.fields = Object.entries(parseFrontmatter(source)?.data ?? {}).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join("、") : value, // i18n-ignore list value separator; what's shown is user data
    }));
    this.lineCount = source.split("\n").length;
  }
  eq(other: FrontmatterWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    // Estimated from source lines: lines = field count + two `---`, and the two extra lines offset the card's padding and margin
    const cover = this.fields.some((f) => f.key === COVER_KEY && f.value);
    if (!cover) return this.lineCount * FM_ROW_HEIGHT;
    // The cover takes no card row; with only a cover there's no card at all
    return COVER_HEIGHT + (this.fields.length > 1 ? (this.lineCount - 1) * FM_ROW_HEIGHT : 0);
  }
  toDOM(view: EditorView) {
    // The cover is pulled out and rendered as an image (not in the "key value" table); other fields stay in the card, and with only a cover there's no card
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-fm-wrap";
    const cover = this.fields.find((f) => f.key === COVER_KEY && f.value);
    if (cover) wrap.appendChild(coverBlock(cover.value));

    const rest = this.fields.filter((f) => f !== cover);
    if (rest.length > 0 || !cover) {
      const card = document.createElement("div");
      card.className = "cm-lp-fm";
      for (const field of rest) {
        const row = document.createElement("div");
        row.className = "cm-lp-fm-row";
        const name = document.createElement("span");
        name.className = "cm-lp-fm-key";
        name.textContent = field.key;
        const cell = document.createElement("span");
        cell.className = "cm-lp-fm-val";
        cell.textContent = field.value;
        row.append(name, cell);
        card.appendChild(row);
      }
      wrap.appendChild(card);
    }

    // With only a cover, source isn't restored (see isCoverOnlyFrontmatter), so clicking the image shouldn't put the cursor inside; swallow mousedown to keep editor focus
    if (cover && rest.length === 0) {
      wrap.classList.add("cm-lp-fm-locked");
      wrap.addEventListener("mousedown", (e) => e.preventDefault());
    } else editOnClick(wrap, view, FM_CARET_OFFSET);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
