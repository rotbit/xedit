import { useStore } from "@/store/useStore";
import { exportMarkdown, exportHtml, exportPdf, exportImage } from "@/lib/export";
import { toast } from "@/components/Toast";
import { buildRenderOptions } from "./renderOptions";

export type ExportKind = "md" | "html" | "pdf" | "image" | "docx";

/** 导出格式清单：⋯ 菜单的「导出」小节与命令面板共用这一份，别各写各的 */
export const EXPORT_ITEMS: { kind: ExportKind; label: string }[] = [
  { kind: "md", label: "导出 Markdown" },
  { kind: "html", label: "导出 HTML" },
  { kind: "docx", label: "导出 Word（可导入飞书）" },
  { kind: "pdf", label: "导出 PDF（打印）" },
  { kind: "image", label: "导出长图（PNG）" },
];

/** 按当前主题与排版设置导出全文 */
export async function runExport(kind: ExportKind): Promise<void> {
  const s = useStore.getState();
  if (kind === "md") {
    exportMarkdown(s.title, s.content);
    return;
  }
  if (kind === "docx") {
    // Word 导出不吃主题样式（飞书/Word 导入会重排视觉），无需渲染选项
    toast("正在生成 Word 文档…");
    const { exportDocx } = await import("@/lib/exportDocx");
    await exportDocx(s.title, s.content);
    return;
  }
  const opts = await buildRenderOptions();
  if (kind === "html") await exportHtml(s.title, s.content, opts);
  else if (kind === "pdf") await exportPdf(s.title, s.content, opts);
  else {
    toast("正在生成长图…");
    try {
      await exportImage(s.title, s.content, opts);
    } catch {
      // 跨域外链图片会让 html-to-image 整张失败，给用户一个能看懂的原因
      toast("长图生成失败（外链图片可能跨域受限）", "error");
    }
  }
}
