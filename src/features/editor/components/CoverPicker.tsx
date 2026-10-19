"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { toast } from "@/components/Toast";
import { useCan } from "@/hooks/usePermissions";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { parseFrontmatter } from "@/lib/frontmatter";
import { saveImageSrc } from "@/lib/editor/commands";
import { MAX_IMAGE_SIZE, sizeLimitError } from "@/lib/media";
import {
  ATTACHMENTS_RESOLVED_EVENT,
  isAttachmentSrc,
  resolveAttachmentSrc,
} from "@/lib/localBackend/attachmentUrls";
import { CoverAiTab } from "./CoverAiTab";
import { COVER_RATIO, coverTileCls } from "./coverStyles";

/**
 * The 「封面」 (Cover) in the meta row: pick an image and store it in the article frontmatter's `cover:`.
 * Three sources: images in the body / upload from computer / AI generated (enabled per account in admin) — the latter two aren't in the body but count just the same
 * (sending to WeChat uploads the image along with it; see coverImage in sendWechatDraft).
 * The cover travels with the body, so sync and export need no special handling.
 */

export const COVER_KEY = "cover";

const MD_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

/** Image URLs appearing in the body, deduped in order of appearance */
export function bodyImages(body: string): string[] {
  const found: { at: number; src: string }[] = [];
  for (const m of body.matchAll(MD_IMAGE)) found.push({ at: m.index, src: m[1] });
  for (const m of body.matchAll(HTML_IMAGE)) found.push({ at: m.index, src: m[1] });
  found.sort((a, b) => a.at - b.at);
  return [...new Set(found.map((f) => f.src))];
}

/** The article's current cover URL; "" if unset */
export function coverOf(content: string): string {
  const value = parseFrontmatter(content)?.data[COVER_KEY];
  return typeof value === "string" ? value : "";
}

/**
 * Relative path → a URL usable by <img>. Images in a disk library are read asynchronously:
 * returns "" until read (don't render <img> then, an empty src counts as a load failure), and re-renders when the event arrives.
 */
function useDisplaySrc(): (src: string) => string {
  const [, bump] = useState(0);
  useEffect(() => {
    const onResolved = () => bump((n) => n + 1);
    window.addEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
    return () => window.removeEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
  }, []);
  return (src: string) => (isAttachmentSrc(src) ? (resolveAttachmentSrc(src) ?? "") : src);
}

export function CoverPicker({
  content,
  onPick,
}: {
  content: string;
  /** Which image was chosen (the URL written into the body); null = no cover. Writing back to the body is the caller's job */
  onPick: (src: string | null) => void;
}) {
  const t = useT();
  const cover = coverOf(content);
  const display = useDisplaySrc();
  const shown = cover ? display(cover) : "";
  // A cover not in the body is legitimate (uploaded/generated images); it only counts as broken if the image truly fails to load.
  // Record *which* image failed rather than a boolean: changing the cover naturally invalidates the record, no effect needed to clear it
  const [brokenSrc, setBrokenSrc] = useState("");
  const broken = cover !== "" && brokenSrc === cover;

  return (
    <Dropdown
      align="left"
      width={320}
      // Uploading opens the system file picker, which blurs the window — the default close-on-blur would dismiss the panel along with upload progress
      closeOnBlur={false}
      trigger={
        <button
          className={`flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] ${broken ? "text-[var(--danger,#d9534f)]" : "text-[var(--ink-faint)]"}`}
          title={
            broken ? t("封面图片打不开了，请重新选择") : t("公众号封面：发送到公众号时自动设好")
          }
        >
          {shown && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt=""
              className="h-3.5 w-[33px] shrink-0 rounded-[2px] object-cover"
              onError={() => setBrokenSrc(cover)}
            />
          ) : (
            <ImageIcon size={12} className="shrink-0" />
          )}
          <span>{broken ? t("封面已失效") : cover ? t("封面") : t("设置封面")}</span>
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        </button>
      }
    >
      {(close) => <CoverPanel content={content} cover={cover} onPick={onPick} close={close} />}
    </Dropdown>
  );
}

type Tab = "body" | "upload" | "ai";
const TABS: [Tab, string][] = [
  ["body", tk("正文图片")],
  ["upload", tk("上传")],
  ["ai", tk("AI 生成")],
];

function CoverPanel({
  content,
  cover,
  onPick,
  close,
}: {
  content: string;
  cover: string;
  onPick: (src: string | null) => void;
  close: () => void;
}) {
  const t = useT();
  const body = useMemo(() => parseFrontmatter(content)?.body ?? content, [content]);
  const images = useMemo(() => bodyImages(body), [body]);
  // Generation costs the site money and is only open to accounts with 「AI 生成封面」 (AI cover generation) enabled (the server checks too; see /api/cover/generate).
  // Everyone else doesn't even get the tab: a tab that only says "not available" when clicked is pointless
  const canCover = useCan("ai_cover");
  const tabs = canCover ? TABS : TABS.filter(([id]) => id !== "ai");
  // With no images in the body, start on 「上传」 (Upload): leaving people staring at "insert an image into the body first" is pointless
  const [tab, setTab] = useState<Tab>(images.length > 0 ? "body" : "upload");
  const display = useDisplaySrc();
  const outside = cover !== "" && !images.includes(cover);
  const coverShown = outside ? display(cover) : "";

  /** Uploaded and generated images share one save path: to the disk library if there is one, otherwise to the cloud */
  const setCoverFile = async (file: File) => {
    try {
      onPick(await saveImageSrc(file));
      close();
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t("保存封面失败"), "error");
    }
  };

  return (
    // Dropdown closes on inner clicks by default, but this panel must stay open for tab switching and form filling, so each place decides when to close
    <div onClick={(e) => e.stopPropagation()}>
      <div className="mx-3 mt-1 flex items-center gap-0.5 rounded-md border border-[var(--hairline)] p-0.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`h-6 flex-1 cursor-pointer rounded text-[12px] transition-colors ${
              tab === id
                ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {/* When the cover isn't in the body it can't appear in any of the three tabs, so give it its own row to show which image is in use */}
      {coverShown ? (
        <div className="mx-3 mt-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverShown}
            alt=""
            className="w-[92px] shrink-0 rounded-md border border-[var(--hairline)] object-cover"
            style={COVER_RATIO}
          />
          <span className="text-[12px] text-[var(--ink-faint)]">{t("当前封面")}</span>
        </div>
      ) : null}

      {tab === "body" ? (
        <BodyTab
          images={images}
          cover={cover}
          display={display}
          onPick={(src) => {
            onPick(src);
            close();
          }}
        />
      ) : null}
      {tab === "upload" ? <UploadTab onFile={setCoverFile} /> : null}
      {tab === "ai" ? <CoverAiTab onUse={setCoverFile} /> : null}

      {cover ? (
        <button
          className="mx-1.5 mb-0.5 w-[calc(100%-12px)] cursor-pointer rounded-md px-1.5 py-1.5 text-left text-[12px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          onClick={() => {
            onPick(null);
            close();
          }}
        >
          {t("不设封面")}
        </button>
      ) : null}
    </div>
  );
}

function BodyTab({
  images,
  cover,
  display,
  onPick,
}: {
  images: string[];
  cover: string;
  display: (src: string) => string;
  onPick: (src: string) => void;
}) {
  const t = useT();
  if (images.length === 0)
    return (
      <div className="px-3 pb-3 pt-2 text-[12px] leading-relaxed text-[var(--ink-soft,var(--ink-faint))]">
        {t("正文里还没有图片。先在正文插一张，或者换上面的「上传」「AI 生成」。")}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-2">
      {images.map((src) => {
        const on = src === cover;
        return (
          <button
            key={src}
            className={`${coverTileCls} ${on ? "border-[var(--accent)]! shadow-[0_0_0_1px_var(--accent)]" : ""}`}
            style={COVER_RATIO}
            title={on ? t("当前封面") : t("设为封面")}
            onClick={() => onPick(src)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={display(src)} alt="" loading="lazy" className="h-full w-full object-cover" />
            {on ? (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                <Check size={12} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function UploadTab({ onFile }: { onFile: (file: File) => Promise<void> }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) return toast(t("封面只能用图片"), "error");
    if (file.size > MAX_IMAGE_SIZE) return toast(sizeLimitError(file.type), "error");
    setBusy(true);
    await onFile(file);
    setBusy(false);
  };

  return (
    <div className="px-3 pb-2 pt-2">
      <div
        className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed transition-colors ${
          busy
            ? "border-[var(--hairline-strong)] text-[var(--ink-faint)]"
            : over
              ? "cursor-copy border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--ink)]"
              : "cursor-pointer border-[var(--hairline-strong)] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
        }`}
        style={COVER_RATIO}
        onClick={() => {
          if (!busy) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
      >
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[12px]">{t("正在上传…")}</span>
          </>
        ) : (
          <>
            <ImagePlus size={18} />
            <span className="text-[12px]">{t("点击选择，或把图片拖到这里")}</span>
            <span className="text-[11px] text-[var(--ink-faint)]">
              {t("建议 900×383 以上，10MB 以内")}
            </span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear value afterwards: otherwise picking the same file again won't fire change, and the user thinks the click did nothing
          e.target.value = "";
          void take(file);
        }}
      />
    </div>
  );
}
