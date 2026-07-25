import { useStore } from "@/store/useStore";
import { exportMarkdown, exportHtml, exportPdf, exportImage } from "@/lib/export";
import { toast } from "@/components/Toast";
import { buildRenderOptions } from "./renderOptions";

export type ExportKind = "md" | "html" | "pdf" | "image";

/** 按当前主题与排版设置导出全文 */
export async function runExport(kind: ExportKind): Promise<void> {
  const s = useStore.getState();
  if (kind === "md") {
    exportMarkdown(s.title, s.content);
    return;
  }
  const opts = await buildRenderOptions();
  if (kind === "html") await exportHtml(s.title, s.content, opts);
  else if (kind === "pdf") await exportPdf(s.title, s.content, opts);
  else {
    toast("正在生成长图…");
    await exportImage(s.title, s.content, opts);
  }
}
