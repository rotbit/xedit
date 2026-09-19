import { EditorView, WidgetType } from "@codemirror/view";
import { parseFrontmatter } from "@/lib/frontmatter";
import { editOnClick } from "@/lib/livePreview/widgetUtils";
import { ATTACHMENTS_RESOLVED_EVENT, isAttachmentSrc, resolveAttachmentSrc } from "@/lib/localBackend/attachmentUrls";

/**
 * 文首 YAML frontmatter 的即时渲染部件：一张只读的元信息卡片。
 *
 * 不隐藏、也不美化成正文的一部分——frontmatter 是给机器看的元数据，
 * 排成「键 值」两列的卡片正好把它和正文划清界限（Obsidian 的属性面板也是这个思路）。
 * 光标进入区间即还原源码（判定在 blocks.ts），所以卡片不必可编辑。只有封面一项时例外：一直渲染成图。
 *
 * DOM 全部用 textContent 拼，没有一处 innerHTML：frontmatter 里可能写着任何字符，
 * 这条路径上也就不需要再过一次 DOMPurify。
 */

/** 卡片一行的高度：13px 字号 × 1.7 行高 ≈ 22px（见 live-frontmatter.css 的 .cm-lp-fm） */
const FM_ROW_HEIGHT = 22;

/** `cover:` 不显示地址，直接渲染成一张 2.35:1（公众号头条封面比例）的图；COVER_HEIGHT 按单栏正文宽（约 704px）估的图高 + 上下留白，见 live-frontmatter.css */
const COVER_KEY = "cover";
const COVER_HEIGHT = 335;

/** 点卡片后光标落到第二行（`---\n` 之后）：严格落在区间内部才会还原源码 */
const FM_CARET_OFFSET = 4;

/**
 * frontmatter 里是不是只有 `cover:` 这一项。这种 frontmatter 是「封面」选择器写进去的，
 * 改也是回选择器里改，源码（一长串图片地址）没有可看可改的东西——所以光标碰到也不还原源码，
 * 始终保持渲染成图（判定用在 blocks.ts）。还有别的字段时照旧点开编辑。
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

/** 封面：与正文同宽的一张 2.35:1 题图（公众号头条封面的比例），像文章的头图一样压在正文最上面 */
function coverBlock(src: string): HTMLElement {
  const block = document.createElement("div");
  block.className = "cm-lp-fm-cover";
  const img = document.createElement("img");
  img.alt = "";
  // 磁盘文库里的图是异步读的：没读到先空着。源码没变部件不会重建（见 eq），所以自己等读到再补上
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
  // 图上只压一枚小标签说明这是什么；怎么换放在悬停提示里，不占版面
  const frame = document.createElement("div");
  frame.className = "cm-lp-fm-cover-frame";
  frame.title = "发送到公众号时自动设置；在标题下方的「封面」里更换";
  const badge = document.createElement("span");
  badge.className = "cm-lp-fm-cover-badge";
  badge.textContent = "公众号封面";
  frame.append(img, badge);
  block.appendChild(frame);
  return block;
}

export class FrontmatterWidget extends WidgetType {
  /** 构造时解析一次：source 变了就是另一个部件（见 eq），toDOM 只负责拼 DOM */
  private readonly fields: { key: string; value: string }[];
  private readonly lineCount: number;

  constructor(readonly source: string) {
    super();
    // 所有键一视同仁：列表写法用顿号连起来，其余原样显示
    this.fields = Object.entries(parseFrontmatter(source)?.data ?? {}).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join("、") : value,
    }));
    this.lineCount = source.split("\n").length;
  }
  eq(other: FrontmatterWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    // 按源码行数估：行数 = 字段数 + 两条 `---`，多算的两行正好抵掉卡片的内边距与外边距
    const cover = this.fields.some((f) => f.key === COVER_KEY && f.value);
    if (!cover) return this.lineCount * FM_ROW_HEIGHT;
    // 封面不占卡片的行；只有封面时连卡片都没有
    return COVER_HEIGHT + (this.fields.length > 1 ? (this.lineCount - 1) * FM_ROW_HEIGHT : 0);
  }
  toDOM(view: EditorView) {
    // 封面单独拎出来渲染成图（不进「键 值」表）；其余字段还是那张卡片，只有封面时就不要卡片了
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

    // 只有封面时不还原源码（见 isCoverOnlyFrontmatter），点图也就不该把光标送进去；吞掉 mousedown 保住编辑器焦点
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
