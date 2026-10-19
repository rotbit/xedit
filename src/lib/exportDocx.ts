import { AlignmentType, Document, LevelFormat, Packer, Paragraph } from "docx";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { inlineAttachments } from "@/lib/localBackend/attachmentUrls";
import { saveExport } from "@/lib/export";
import { toast } from "@/components/Toast";
import { childBlocks } from "./docx/block";
import { prepareMedia, stripSpaceAfterBreaks } from "./docx/media";
import { BODY_FONT, INK, OL_REF } from "./docx/types";
import type { Build } from "./docx/types";
import { t } from "@/i18n/t";

// Export to Word (.docx): render Markdown to semantic HTML, then map node by node to OOXML.
// The goal is to keep structure after importing into Feishu/Word (heading levels, lists, tables, images, code blocks, math),
// not to reproduce the WeChat theme's look — importers restyle anyway; semantic structure is what carries over.
// Video can't be embedded in docx (Word only has "online video" links), so it's exported as a cover image + clickable play link.
//
// Media preparation, inline node conversion, and block node conversion live in lib/docx/{media,inline,block}.ts;
// this file keeps only the public entry point and final document assembly (numbering/style definitions + Document assembly).

// —— Document assembly ——

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
      // Explicit left alignment: WPS/Feishu online editing defaults to justified, which stretches lines before in-paragraph breaks (<w:br/>) to full width
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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Returns false if the user canceled "Save As" (no prompt); success/failure toasts are shown here,
 *  because only the generation step knows that "some images weren't embedded" */
export async function exportDocx(
  title: string,
  markdown: string
): Promise<boolean> {
  let failed = 0;
  try {
    const saved = await saveExport(
      title,
      ".docx",
      DOCX_MIME,
      async () => {
        const r = await buildDocx(markdown);
        failed = r.failed;
        return r.blob;
      }
    );
    if (!saved) return false;
    if (failed) toast(t("已导出，但 {n} 个图片未能嵌入（获取失败）", { n: failed }), "error");
    else toast(t("Word 文档已导出"));
    return true;
  } catch (e) {
    console.error("[exportDocx]", e);
    toast(t("Word 生成失败"), "error");
    return false;
  }
}

async function buildDocx(markdown: string): Promise<{ blob: Blob; failed: number }> {
  // Math rendering depends on MathJax; if it failed to load, fall back to TeX text
  if (markdown.includes("$")) await ensureMathJax().catch(() => undefined);
  // Local images from a disk library are inlined as base64 first so prepareMedia can get their bytes
  const html = sanitizeHtml(renderMarkdown(await inlineAttachments(markdown), {}));
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
  return { blob: await Packer.toBlob(doc), failed: b.failed };
}
