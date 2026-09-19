"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { parseFrontmatter } from "@/lib/frontmatter";
import {
  ATTACHMENTS_RESOLVED_EVENT,
  isAttachmentSrc,
  resolveAttachmentSrc,
} from "@/lib/localBackend/attachmentUrls";

/**
 * 元信息行里的「封面」：从正文图片里挑一张，存进 frontmatter 的 `cover:`。
 * 封面跟着正文走（同步、导出都不用另外管），「发送到公众号」时据此在后台自动选好封面。
 * 第一版只能选正文里已有的图——公众号的「从正文选择」也只认正文图。
 */

export const COVER_KEY = "cover";

const MD_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

/** 正文里出现过的图片地址，按出现顺序去重 */
export function bodyImages(body: string): string[] {
  const found: { at: number; src: string }[] = [];
  for (const m of body.matchAll(MD_IMAGE)) found.push({ at: m.index, src: m[1] });
  for (const m of body.matchAll(HTML_IMAGE)) found.push({ at: m.index, src: m[1] });
  found.sort((a, b) => a.at - b.at);
  return [...new Set(found.map((f) => f.src))];
}

/** 文章当前的封面地址；没设返回 "" */
export function coverOf(content: string): string {
  const value = parseFrontmatter(content)?.data[COVER_KEY];
  return typeof value === "string" ? value : "";
}

export function CoverPicker({
  content,
  onPick,
}: {
  content: string;
  /** 选了哪张（正文里的原始地址）；null = 不设封面。写回正文由调用方做 */
  onPick: (src: string | null) => void;
}) {
  const cover = coverOf(content);
  const images = useMemo(() => bodyImages(parseFrontmatter(content)?.body ?? content), [content]);
  const stale = cover !== "" && !images.includes(cover);

  // 磁盘文库里的图是异步读出来的：读到后重渲染一次，把空缩略图换成真图
  const [, bump] = useState(0);
  useEffect(() => {
    const onResolved = () => bump((n) => n + 1);
    window.addEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
    return () => window.removeEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
  }, []);
  const display = (src: string) => (isAttachmentSrc(src) ? (resolveAttachmentSrc(src) ?? "") : src);

  return (
    <Dropdown
      align="left"
      width={296}
      trigger={
        <button
          className={`flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] ${stale ? "text-[var(--danger,#d9534f)]" : "text-[var(--ink-faint)]"}`}
          title={
            stale
              ? "封面那张图已经不在正文里了，请重新选择"
              : "公众号封面：发送到公众号时自动设好"
          }
        >
          {cover && !stale ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={display(cover)} alt="" className="h-3.5 w-[33px] shrink-0 rounded-[2px] object-cover" />
          ) : (
            <ImageIcon size={12} className="shrink-0" />
          )}
          <span>{stale ? "封面已失效" : cover ? "封面" : "设置封面"}</span>
          <ChevronDown size={11} className="shrink-0 opacity-60" />
        </button>
      }
    >
      <div className="px-3 pb-1 pt-1.5 text-[12px] text-[var(--ink-faint)]">
        从正文图片里选一张作公众号封面
      </div>
      {images.length === 0 ? (
        <div className="px-3 pb-3 pt-2 text-[12px] leading-relaxed text-[var(--ink-soft,var(--ink-faint))]">
          正文里还没有图片。先在正文插入一张图，再回来选它当封面。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-1.5">
          {images.map((src) => {
            const on = src === cover;
            return (
              <button
                key={src}
                className={`relative cursor-pointer overflow-hidden rounded-md border bg-[var(--accent-wash)] transition-shadow ${on ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-[var(--hairline)] hover:border-[var(--hairline-strong)]"}`}
                // 2.35:1 = 公众号头条封面的比例，所见即大致所得（最终裁剪以后台为准）
                style={{ aspectRatio: "2.35 / 1" }}
                title={on ? "当前封面" : "设为封面"}
                onClick={() => onPick(src)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={display(src)} alt="" loading="lazy" className="h-full w-full object-cover" />
                {on ? (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {cover ? (
        <button
          className="mx-1.5 mb-0.5 w-[calc(100%-12px)] cursor-pointer rounded-md px-1.5 py-1.5 text-left text-[12px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          onClick={() => onPick(null)}
        >
          不设封面
        </button>
      ) : null}
    </Dropdown>
  );
}
