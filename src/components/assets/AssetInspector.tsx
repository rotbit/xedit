"use client";

import { Code2, FileText, Link2, Trash2, X } from "lucide-react";
import type { Asset, UsageDoc } from "./types";
import { copyText, formatSize, isVideo } from "./utils";
import { formatDateTime } from "@/lib/format";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";

/** Right-hand detail panel: preview + actions + basic info + reverse usage lookup */

const SOURCE_LABEL: Record<string, string> = {
  upload: tk("上传"),
  ai: tk("由 AI 生成"), // Source labels; "AI 生成" is already used as a verb in the cover panel, so it's translated differently
  mcp: "MCP",
  feishu: tk("飞书"),
};

const actionCls =
  "flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-[var(--hairline-strong)] text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]";

const labelCls = "shrink-0 text-[11.5px] text-[var(--ink-faint)]";
const valueCls = "min-w-0 break-all text-right text-[11.5px] text-[var(--ink-soft)]";
// Module-level JSX constant: the same element is used twice below, and React allows one element object to render in multiple places
const divider = <div className="my-4 h-px bg-[var(--hairline)]" />;
const sectionTitle = "mb-2 text-[11.5px] font-medium text-[var(--ink-faint)]";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={labelCls}>{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}

/** Reverse usage list: documents in the trash aren't clickable and are marked 「已删除」 (Deleted) */
function UsageList({
  docs,
  onOpenDoc,
}: {
  docs: UsageDoc[] | undefined;
  onOpenDoc?: (id: string) => void;
}) {
  const t = useT();
  // undefined means "not loaded yet", an empty array means "checked, genuinely unused" — the two must not share copy
  if (!docs) return <p className="text-[11.5px] text-[var(--ink-faint)]">{t("正在查询引用…")}</p>;
  if (docs.length === 0) {
    return <p className="text-[11.5px] text-[var(--ink-faint)]">{t("未被任何文章引用")}</p>;
  }
  return (
    <>
      <p className={sectionTitle}>{t("用在 {n} 篇文章", { n: docs.length })}</p>
      <ul className="flex flex-col gap-1">
        {docs.map((d) => {
          const inner = (
            <>
              <FileText size={12} className="shrink-0 text-[var(--ink-faint)]" />
              <span className="truncate">{d.title || t(UNTITLED_DOC)}</span>
            </>
          );
          const base =
            "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px]";
          if (d.deletedAt) {
            return (
              <li key={d.id} className={`${base} text-[var(--ink-faint)]`} title={t("在回收站中")}>
                {inner}
                <span className="ml-auto shrink-0 text-[11px]">{t("已删除")}</span>
              </li>
            );
          }
          return (
            <li key={d.id}>
              {onOpenDoc ? (
                <button
                  className={`${base} cursor-pointer text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]`}
                  title={t("打开「{title}」", { title: d.title })}
                  onClick={() => onOpenDoc(d.id)}
                >
                  {inner}
                </button>
              ) : (
                <a
                  // Without onOpenDoc (e.g. the standalone image library page) fall back to a full-page navigation; nothing lost, just slower
                  href={`/?doc=${d.id}`}
                  className={`${base} text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]`}
                  title={t("打开「{title}」", { title: d.title })}
                >
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Asset detail panel. When the asset changes the whole content swaps, no enter/exit animation; usage is fetched on demand by the parent, this only renders its three states clearly. */
export function AssetInspector({
  asset,
  usage,
  onClose,
  onDelete,
  onOpenDoc,
}: {
  asset: Asset;
  /** Documents referencing this asset; undefined = not loaded yet */
  usage: UsageDoc[] | undefined;
  onClose: () => void;
  onDelete: (asset: Asset) => void;
  /** Open a referencing document: the workspace passes nav.openDoc to switch views in place; defaults to /?doc=<id> */
  onOpenDoc?: (id: string) => void;
}) {
  const t = useT();
  const video = isVideo(asset);
  const size =
    // Videos never recorded dimensions, so "—" means not applicable; images missing dimensions are incomplete records, shown as 「未记录」 (Not recorded)
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : video ? "—" : t("未记录");

  return (
    // No room for side-by-side on narrow screens, so the detail panel becomes a full-screen overlay
    <aside className="fixed inset-0 z-50 overflow-y-auto bg-[var(--panel)] px-4 py-3 md:static md:z-auto md:w-[300px] md:shrink-0 md:border-l md:border-[var(--hairline)]">
      <div className="mb-2 flex items-center justify-end">
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          title={t("关闭详情")}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      {/* Preview */}
      <div className="flex max-h-[260px] items-center justify-center overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--paper)]">
        {video ? (
          <video src={asset.url} controls playsInline className="max-h-[260px] w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.key}
            className="max-h-[260px] w-full object-contain"
          />
        )}
      </div>

      <p className="mt-3 break-all text-[13px] leading-5 text-[var(--ink)]">
        {asset.key.split("/").pop()}
      </p>

      {/* Action row */}
      <div className="mt-3 flex items-center gap-1.5">
        <button className={actionCls} onClick={() => copyText(asset.url, t("链接已复制"))}>
          <Link2 size={12} />
          {t("复制链接")}
        </button>
        <button className={actionCls} onClick={() => copyText(`![](${asset.url})`, t("Markdown 已复制"))}>
          <Code2 size={12} />
          Markdown
        </button>
        <button
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--hairline-strong)] text-red-600 transition-colors hover:bg-[var(--paper)]"
          title={t("删除")}
          onClick={() => onDelete(asset)}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {divider}

      <p className={sectionTitle}>{t("基本信息")}</p>
      <div className="flex flex-col gap-1.5">
        <InfoRow label={t("尺寸")} value={size} />
        <InfoRow label={t("大小")} value={formatSize(asset.size)} />
        <InfoRow label={t("格式")} value={(asset.mime.split("/")[1] ?? asset.mime).toUpperCase()} />
        <InfoRow label={t("来源")} value={SOURCE_LABEL[asset.source] ? t(SOURCE_LABEL[asset.source]) : asset.source} />
        <InfoRow label={t("上传时间")} value={formatDateTime(asset.createdAt, { pad: true })} />
      </div>

      {divider}

      <UsageList docs={usage} onOpenDoc={onOpenDoc} />
    </aside>
  );
}
