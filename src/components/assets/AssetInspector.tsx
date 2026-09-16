"use client";

import { Code2, FileText, Link2, Trash2, X } from "lucide-react";
import type { Asset, UsageDoc } from "./types";
import { copyText, formatSize, isVideo } from "./utils";
import { formatDateTime } from "@/lib/format";
import { UNTITLED_DOC } from "@/lib/docDefaults";

/** 右侧详情栏：预览 + 操作 + 基本信息 + 引用反查 */

const SOURCE_LABEL: Record<string, string> = {
  upload: "上传",
  ai: "AI 生成",
  mcp: "MCP",
  feishu: "飞书",
};

const actionCls =
  "flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-[var(--hairline-strong)] text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]";

const labelCls = "shrink-0 text-[11.5px] text-[var(--ink-faint)]";
const valueCls = "min-w-0 break-all text-right text-[11.5px] text-[var(--ink-soft)]";
// 模块级的 JSX 常量：同一份元素在下面用了两次，React 允许一个元素对象渲染到多个位置
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

/** 引用反查列表：回收站里的文章不可点，标「已删除」 */
function UsageList({
  docs,
  onOpenDoc,
}: {
  docs: UsageDoc[] | undefined;
  onOpenDoc?: (id: string) => void;
}) {
  // undefined 是「还没查回来」，空数组是「查过、确实没人引用」，两种状态的文案不能混
  if (!docs) return <p className="text-[11.5px] text-[var(--ink-faint)]">正在查询引用…</p>;
  if (docs.length === 0) {
    return <p className="text-[11.5px] text-[var(--ink-faint)]">未被任何文章引用</p>;
  }
  return (
    <>
      <p className={sectionTitle}>用在 {docs.length} 篇文章</p>
      <ul className="flex flex-col gap-1">
        {docs.map((d) => {
          const inner = (
            <>
              <FileText size={11} className="shrink-0 text-[var(--ink-faint)]" />
              <span className="truncate">{d.title || UNTITLED_DOC}</span>
            </>
          );
          const base =
            "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px]";
          if (d.deletedAt) {
            return (
              <li key={d.id} className={`${base} text-[var(--ink-faint)]`} title="在回收站中">
                {inner}
                <span className="ml-auto shrink-0 text-[11px]">已删除</span>
              </li>
            );
          }
          return (
            <li key={d.id}>
              {onOpenDoc ? (
                <button
                  className={`${base} cursor-pointer text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]`}
                  title={`打开「${d.title}」`}
                  onClick={() => onOpenDoc(d.id)}
                >
                  {inner}
                </button>
              ) : (
                <a
                  // 没传 onOpenDoc（比如独立的图片库页面）时退回整页跳转，功能不缺只是慢一点
                  href={`/?doc=${d.id}`}
                  className={`${base} text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]`}
                  title={`打开「${d.title}」`}
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

/** 素材详情栏。asset 换了就整块换内容，不做进出场动画；usage 由上层按需查，这里只负责把三种状态呈现清楚。 */
export function AssetInspector({
  asset,
  usage,
  onClose,
  onDelete,
  onOpenDoc,
}: {
  asset: Asset;
  /** 该素材的引用文章；undefined = 尚未查回来 */
  usage: UsageDoc[] | undefined;
  onClose: () => void;
  onDelete: (asset: Asset) => void;
  /** 打开引用文章：工作台传 nav.openDoc 就地切换视图；缺省退回 /?doc=<id> */
  onOpenDoc?: (id: string) => void;
}) {
  const video = isVideo(asset);
  const size =
    // 视频本来就没记尺寸，用「—」表示不适用；图片缺尺寸是入库数据没补全，用「未记录」区分开
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : video ? "—" : "未记录";

  return (
    // 窄屏没有并排的余地，详情栏改成整屏覆盖层
    <aside className="fixed inset-0 z-50 overflow-y-auto bg-[var(--panel)] px-4 py-3 md:static md:z-auto md:w-[300px] md:shrink-0 md:border-l md:border-[var(--hairline)]">
      <div className="mb-2 flex items-center justify-end">
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          title="关闭详情"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>

      {/* 预览 */}
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

      {/* 操作行 */}
      <div className="mt-3 flex items-center gap-1.5">
        <button className={actionCls} onClick={() => copyText(asset.url, "链接")}>
          <Link2 size={12} />
          复制链接
        </button>
        <button className={actionCls} onClick={() => copyText(`![](${asset.url})`, "Markdown ")}>
          <Code2 size={12} />
          Markdown
        </button>
        <button
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--hairline-strong)] text-red-600 transition-colors hover:bg-[var(--paper)]"
          title="删除"
          onClick={() => onDelete(asset)}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {divider}

      <p className={sectionTitle}>基本信息</p>
      <div className="flex flex-col gap-1.5">
        <InfoRow label="尺寸" value={size} />
        <InfoRow label="大小" value={formatSize(asset.size)} />
        <InfoRow label="格式" value={(asset.mime.split("/")[1] ?? asset.mime).toUpperCase()} />
        <InfoRow label="来源" value={SOURCE_LABEL[asset.source] ?? asset.source} />
        <InfoRow label="上传时间" value={formatDateTime(asset.createdAt, { pad: true })} />
      </div>

      {divider}

      <UsageList docs={usage} onOpenDoc={onOpenDoc} />
    </aside>
  );
}
