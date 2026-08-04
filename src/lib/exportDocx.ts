import { AlignmentType, Document, LevelFormat, Packer, Paragraph } from "docx";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { downloadFile } from "@/lib/export";
import { toast } from "@/components/Toast";
import { childBlocks } from "./docx/block";
import { prepareMedia, stripSpaceAfterBreaks } from "./docx/media";
import { BODY_FONT, INK, OL_REF } from "./docx/types";
import type { Build } from "./docx/types";

// 导出 Word（.docx）：把 Markdown 渲染成语义 HTML 后逐节点映射为 OOXML。
// 目标是导入飞书/Word 后保留结构（标题层级、列表、表格、图片、代码块、公式），
// 而非还原公众号主题视觉——导入方会重排样式，语义结构才是可迁移的部分。
// 视频无法嵌入 docx（Word 只有"联机视频"链接机制），导出为封面图 + 可点击的播放链接。
//
// 具体的媒体准备、行内节点转换、块级节点转换分别拆在 lib/docx/{media,inline,block}.ts，
// 本文件只保留对外入口与最终文档组装（编号/样式定义 + Document 拼装）。

// —— 文档组装 ——

const NUMBERING = {
  config: [
    {
      reference: OL_REF,
      levels: [0, 1, 2, 3].map((level) => ({
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 + 480 * level, hanging: 360 } } },
      })),
    },
  ],
};

const heading = (size: number, before: number, after: number) => ({
  run: { size, bold: true, color: INK, font: BODY_FONT },
  paragraph: { spacing: { before, after } },
});

const STYLES = {
  default: {
    document: {
      run: { size: 22, color: INK, font: BODY_FONT },
      // 显式左对齐：WPS/飞书在线编辑默认两端对齐，会把段内换行（<w:br/>）前的行拉伸铺满
      paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 160, line: 300 } },
    },
    heading1: heading(36, 320, 200),
    heading2: heading(32, 280, 180),
    heading3: heading(28, 240, 160),
    heading4: heading(26, 200, 140),
    heading5: heading(24, 160, 120),
    heading6: heading(22, 160, 120),
  },
};

export async function exportDocx(title: string, markdown: string): Promise<void> {
  try {
    // 公式渲染依赖 MathJax；未加载成功时降级为 TeX 文本
    if (markdown.includes("$")) await ensureMathJax().catch(() => undefined);
    const html = sanitizeHtml(renderMarkdown(markdown, {}));
    const body = new DOMParser().parseFromString(html, "text/html").body;
    stripSpaceAfterBreaks(body);
    const b: Build = { images: new Map(), math: new Map(), frames: new Map(), olInstance: 0, failed: 0 };
    await prepareMedia(body, b);
    const children = childBlocks(body, { quote: 0 }, b);
    const doc = new Document({
      numbering: NUMBERING,
      styles: STYLES,
      sections: [{ children: children.length ? children : [new Paragraph({})] }],
    });
    downloadFile(
      `${title || "untitled"}.docx`,
      await Packer.toBlob(doc),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    if (b.failed) toast(`已导出，但 ${b.failed} 个图片未能嵌入（获取失败）`, "error");
    else toast("Word 文档已导出");
  } catch {
    toast("Word 生成失败", "error");
  }
}
