import { EditorView, WidgetType } from "@codemirror/view";
import { parseFrontmatter } from "@/lib/frontmatter";
import { editOnClick } from "@/lib/livePreview/widgetUtils";

/**
 * 文首 YAML frontmatter 的即时渲染部件：一张只读的元信息卡片。
 *
 * 不隐藏、也不美化成正文的一部分——frontmatter 是给机器看的元数据，
 * 排成「键 值」两列的卡片正好把它和正文划清界限（Obsidian 的属性面板也是这个思路）。
 * 光标进入区间即还原源码（判定在 blocks.ts），所以卡片不必可编辑。
 *
 * DOM 全部用 textContent 拼，没有一处 innerHTML：frontmatter 里可能写着任何字符，
 * 这条路径上也就不需要再过一次 DOMPurify。
 */

/** 卡片一行的高度：13px 字号 × 1.7 行高 ≈ 22px（见 live-frontmatter.css 的 .cm-lp-fm） */
const FM_ROW_HEIGHT = 22;

/** 点卡片后光标落到第二行（`---\n` 之后）：严格落在区间内部才会还原源码 */
const FM_CARET_OFFSET = 4;

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
    return this.lineCount * FM_ROW_HEIGHT;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-fm";
    for (const field of this.fields) {
      const row = document.createElement("div");
      row.className = "cm-lp-fm-row";
      const name = document.createElement("span");
      name.className = "cm-lp-fm-key";
      name.textContent = field.key;
      const cell = document.createElement("span");
      cell.className = "cm-lp-fm-val";
      cell.textContent = field.value;
      row.append(name, cell);
      wrap.appendChild(row);
    }

    editOnClick(wrap, view, FM_CARET_OFFSET);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
