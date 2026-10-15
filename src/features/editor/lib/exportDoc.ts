import { useStore } from "@/store/useStore";
import { exportMarkdown, exportHtml, exportImage } from "@/lib/export";
import { toast } from "@/components/Toast";
import { t, tk } from "@/i18n/t";
import { buildRenderOptions } from "./renderOptions";

export type ExportKind = "md" | "html" | "pdf" | "image" | "docx";

/** 导出格式清单：⋯ 菜单的「导出」小节与命令面板共用这一份，别各写各的；label 存中文原文，显示处再 t() */
export const EXPORT_ITEMS: { kind: ExportKind; label: string }[] = [
  { kind: "md", label: tk("导出 Markdown") },
  { kind: "html", label: tk("导出 HTML") },
  { kind: "docx", label: tk("导出 Word（可导入飞书）") },
  { kind: "pdf", label: tk("导出 PDF") },
  { kind: "image", label: tk("导出长图（PNG）") },
];

/** 按当前主题与排版设置导出全文。
 *  各导出函数先弹「另存为」再生成：用户取消时它们返回 false，这里什么都不提示；
 *  「正在生成…」通过 onBegin 在用户确定保存位置之后才弹，免得对话框还开着就说在生成 */
export async function runExport(kind: ExportKind): Promise<void> {
  const s = useStore.getState();
  if (kind === "md") {
    await exportMarkdown(s.title, s.content);
    return;
  }
  if (kind === "docx") {
    // Word 导出不吃主题样式（飞书/Word 导入会重排视觉），无需渲染选项；成功/失败提示由 exportDocx 自己弹
    const { exportDocx } = await import("@/lib/exportDocx");
    await exportDocx(s.title, s.content, () => toast(t("正在生成 Word 文档…")));
    return;
  }
  const opts = await buildRenderOptions();
  if (kind === "html") await exportHtml(s.title, s.content, opts);
  else if (kind === "pdf") {
    try {
      // jspdf 体积不小，点了才加载，不进首屏 bundle
      const { exportPdf } = await import("@/lib/exportPdf");
      const saved = await exportPdf(s.title, s.content, opts, () => toast(t("正在生成 PDF…")));
      if (saved) toast(t("PDF 已导出"));
    } catch (e) {
      // 原因留在控制台，不然用户反馈「导不出来」时无从查起
      console.error("exportPdf failed", e);
      toast(t("PDF 生成失败（外链图片可能跨域受限）"), "error");
    }
  }
  else {
    try {
      await exportImage(s.title, s.content, opts, () => toast(t("正在生成长图…")));
    } catch {
      // 跨域外链图片会让 html-to-image 整张失败，给用户一个能看懂的原因
      toast(t("长图生成失败（外链图片可能跨域受限）"), "error");
    }
  }
}
