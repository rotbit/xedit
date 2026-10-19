import { useStore } from "@/store/useStore";
import { exportMarkdown, exportHtml, exportImage } from "@/lib/export";
import { toast } from "@/components/Toast";
import { t, tk } from "@/i18n/t";
import { buildRenderOptions } from "./renderOptions";

export type ExportKind = "md" | "html" | "pdf" | "image" | "docx";

/** Export format list: shared by the ⋯ menu's 「导出」 (Export) section and the command palette, so don't duplicate it; labels are stored as the Chinese source and passed through t() at display */
export const EXPORT_ITEMS: { kind: ExportKind; label: string }[] = [
  { kind: "md", label: tk("导出 Markdown") },
  { kind: "html", label: tk("导出 HTML") },
  { kind: "docx", label: tk("导出 Word（可导入飞书）") },
  { kind: "pdf", label: tk("导出 PDF") },
  { kind: "image", label: tk("导出长图（PNG）") },
];

/** Export the full text with the current theme and typography settings.
 *  Each exporter shows "Save as" before generating: if the user cancels it returns false, and nothing is shown here.
 *  No "Generating…" toast: picking a location to finished generation usually takes a second or two, and stacking it with the result toast is just noise */
export async function runExport(kind: ExportKind): Promise<void> {
  const s = useStore.getState();
  if (kind === "md") {
    await exportMarkdown(s.title, s.content);
    return;
  }
  if (kind === "docx") {
    // Word export ignores theme styles (Feishu/Word imports re-lay out visuals), so no render options; exportDocx shows its own success/failure toast
    const { exportDocx } = await import("@/lib/exportDocx");
    await exportDocx(s.title, s.content);
    return;
  }
  const opts = await buildRenderOptions();
  if (kind === "html") await exportHtml(s.title, s.content, opts);
  else if (kind === "pdf") {
    try {
      // jspdf is hefty, so load it on click rather than in the first-load bundle
      const { exportPdf } = await import("@/lib/exportPdf");
      const saved = await exportPdf(s.title, s.content, opts);
      if (saved) toast(t("PDF 已导出"));
    } catch (e) {
      // Keep the cause in the console, otherwise "export doesn't work" reports are impossible to investigate
      console.error("exportPdf failed", e);
      toast(t("PDF 生成失败（外链图片可能跨域受限）"), "error");
    }
  }
  else {
    try {
      await exportImage(s.title, s.content, opts);
    } catch {
      // Cross-origin external images make html-to-image fail entirely; give the user a reason they can understand
      toast(t("长图生成失败（外链图片可能跨域受限）"), "error");
    }
  }
}
