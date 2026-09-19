"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Dropdown } from "@/components/Dropdown";
import { toast } from "@/components/Toast";
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
 * 元信息行里的「封面」：挑一张图存进文章 frontmatter 的 `cover:`。
 * 三个来源：正文图片 / 从电脑上传 / AI 生成（只对管理员开放）——后两种存下来的图不在正文里，一样算数
 * （发送到公众号时连图一起发过去，见 sendWechatDraft 的 coverImage）。
 * 封面跟着正文走，同步、导出都不用另外管。
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

/**
 * 相对路径 → 能给 <img> 的地址。磁盘文库里的图是异步读出来的：
 * 还没读到时返回 ""（这时别渲染 <img>，空 src 会当成加载失败），读到后事件一来重渲染。
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
  /** 选了哪张（写进正文的地址）；null = 不设封面。写回正文由调用方做 */
  onPick: (src: string | null) => void;
}) {
  const cover = coverOf(content);
  const display = useDisplaySrc();
  const shown = cover ? display(cover) : "";
  // 封面不在正文里是合法的（上传、生成的图），只有图真的打不开才算失效。
  // 记「哪张打不开」而不是布尔：换了封面这条记录自然作废，不用再拿 effect 去清
  const [brokenSrc, setBrokenSrc] = useState("");
  const broken = cover !== "" && brokenSrc === cover;

  return (
    <Dropdown
      align="left"
      width={320}
      // 上传要唤起系统文件选择框，那会让窗口失焦——默认的失焦即关会把面板连同上传进度一起收走
      closeOnBlur={false}
      trigger={
        <button
          className={`flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] ${broken ? "text-[var(--danger,#d9534f)]" : "text-[var(--ink-faint)]"}`}
          title={
            broken ? "封面图片打不开了，请重新选择" : "公众号封面：发送到公众号时自动设好"
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
          <span>{broken ? "封面已失效" : cover ? "封面" : "设置封面"}</span>
          <ChevronDown size={11} className="shrink-0 opacity-60" />
        </button>
      }
    >
      {(close) => <CoverPanel content={content} cover={cover} onPick={onPick} close={close} />}
    </Dropdown>
  );
}

type Tab = "body" | "upload" | "ai";
const TABS: [Tab, string][] = [
  ["body", "正文图片"],
  ["upload", "上传"],
  ["ai", "AI 生成"],
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
  const body = useMemo(() => parseFrontmatter(content)?.body ?? content, [content]);
  const images = useMemo(() => bodyImages(body), [body]);
  // 生图花的是站点的钱，目前只对管理员开放（服务端另有一道判定，见 /api/cover/generate）。
  // 其他人连页签都不摆：摆一个点进去只会说「不给用」的功能没意义
  const isAdmin = useSession().data?.user?.isAdmin === true;
  const tabs = isAdmin ? TABS : TABS.filter(([id]) => id !== "ai");
  // 正文一张图都没有时直接停在「上传」：让人对着一句「先去正文插图」发呆没意义
  const [tab, setTab] = useState<Tab>(images.length > 0 ? "body" : "upload");
  const display = useDisplaySrc();
  const outside = cover !== "" && !images.includes(cover);
  const coverShown = outside ? display(cover) : "";

  /** 上传的图与生成的图走同一条保存路：有磁盘文库存文库，否则传云端 */
  const setCoverFile = async (file: File) => {
    try {
      onPick(await saveImageSrc(file));
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存封面失败", "error");
    }
  };

  return (
    // Dropdown 默认点内部就收起，而这个面板要留着切页签、填提示词，关闭时机由各处自己定
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
            {label}
          </button>
        ))}
      </div>

      {/* 封面不在正文里时它在三个页签里都露不了脸，单独摆一行，让人知道现在用的是哪张 */}
      {coverShown ? (
        <div className="mx-3 mt-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverShown}
            alt=""
            className="w-[92px] shrink-0 rounded-md border border-[var(--hairline)] object-cover"
            style={COVER_RATIO}
          />
          <span className="text-[12px] text-[var(--ink-faint)]">当前封面</span>
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
      {tab === "ai" ? <CoverAiTab body={body} onUse={setCoverFile} /> : null}

      {cover ? (
        <button
          className="mx-1.5 mb-0.5 w-[calc(100%-12px)] cursor-pointer rounded-md px-1.5 py-1.5 text-left text-[12px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          onClick={() => {
            onPick(null);
            close();
          }}
        >
          不设封面
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
  if (images.length === 0)
    return (
      <div className="px-3 pb-3 pt-2 text-[12px] leading-relaxed text-[var(--ink-soft,var(--ink-faint))]">
        正文里还没有图片。先在正文插一张，或者换上面的「上传」「AI 生成」。
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
  );
}

function UploadTab({ onFile }: { onFile: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) return toast("封面只能用图片", "error");
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
            <Loader2 size={17} className="animate-spin" />
            <span className="text-[12px]">正在上传…</span>
          </>
        ) : (
          <>
            <ImagePlus size={17} />
            <span className="text-[12px]">点击选择，或把图片拖到这里</span>
            <span className="text-[11px] text-[var(--ink-faint)]">
              建议 900×383 以上，10MB 以内
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
          // 用完清空 value：否则连着选同一个文件不会再触发 change，用户会以为点了没反应
          e.target.value = "";
          void take(file);
        }}
      />
    </div>
  );
}
