"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AiIcon } from "@/components/AiIcon";
import { useCan } from "@/hooks/usePermissions";
import { useT } from "@/i18n/useT";
import { useStore } from "@/store/useStore";
import {
  COVER_COLORS,
  CoverGenerateError,
  coverServiceState,
  dataUrlToFile,
  generateCovers,
  isCoverColor,
  type CoverColor,
  type CoverServiceState,
} from "../lib/coverGenerate";
import { COVER_RATIO, coverTileCls } from "./coverStyles";

/**
 * The cover picker's 「AI 生成」 (AI generate) tab: fill in the title, key words and the two products to compare, then hand them to the site's
 * /api/cover/generate for image generation (the prompt is a fixed server-side template; this only provides the blanks).
 * One image at a time; if it's no good, click 「再来一次」 (Try again); if you like it, it goes down the image-saving path.
 * The Replicate token is server-side (out of the browser's reach), and generation costs the site money and is only open to enabled accounts,
 * so first check whether the site has it configured and whether this account qualifies.
 */

const tip = "px-3 pb-3 pt-2 text-[12px] leading-relaxed text-[var(--ink-soft,var(--ink-faint))]";

const inputCls =
  "h-7 w-full min-w-0 rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2 text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]";

/** The fields remembered locally: product names and colors are usually the same across articles; title and key words differ each time, so they aren't stored */
const SAVED_KEY = "xedit-cover-ai";

interface Saved {
  leftName: string;
  leftColor: CoverColor;
  rightName: string;
  rightColor: CoverColor;
}

const DEFAULT_SAVED: Saved = {
  leftName: "",
  leftColor: "blue",
  rightName: "",
  rightColor: "orange",
};

/** Unreadable or unwritable storage (private mode, quota full) is treated as nothing stored; the form still works */
function readSaved(): Saved {
  if (typeof window === "undefined") return DEFAULT_SAVED;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}");
    const it = (raw ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      leftName: str(it.leftName),
      leftColor: isCoverColor(it.leftColor) ? it.leftColor : DEFAULT_SAVED.leftColor,
      rightName: str(it.rightName),
      rightColor: isCoverColor(it.rightColor) ? it.rightColor : DEFAULT_SAVED.rightColor,
    };
  } catch {
    return DEFAULT_SAVED;
  }
}

function writeSaved(saved: Saved): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // If it can't be remembered, it just gets refilled next time; not worth interrupting generation
  }
}

/** A row of small color dots; the selected one gets a ring */
function Swatches({ value, onPick }: { value: CoverColor; onPick: (color: CoverColor) => void }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-1">
      {COVER_COLORS.map((c) => (
        <button
          key={c.id}
          title={t(c.label)}
          className={`h-3 w-3 cursor-pointer rounded-full transition-shadow ${
            value === c.id ? "shadow-[0_0_0_1px_var(--paper),0_0_0_2px_var(--accent)]" : ""
          }`}
          style={{ background: c.css }}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );
}

export function CoverAiTab({
  /** The chosen image is handed to the caller to save (to the library if there is one, otherwise to the cloud) and set as cover; it shows its own error toast */
  onUse,
}: {
  onUse: (file: File) => Promise<void>;
}) {
  const t = useT();
  const canCover = useCan("ai_cover");
  const [service, setService] = useState<CoverServiceState | "checking">("checking");
  /** Text shown on the forbidden screen: the server's wording if the API returned one, otherwise the default */
  const [denied, setDenied] = useState("");
  // The title is prefilled from the article only once when the tab opens: the cover title may differ from the article's, and edits shouldn't be overwritten
  const [title, setTitle] = useState(() => useStore.getState().title);
  const [highlights, setHighlights] = useState<[string, string]>(["", ""]);
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** The image generated this round (empty string = none yet) */
  const [image, setImage] = useState("");
  /** Saving this one: the spinner overlays the image */
  const [saving, setSaving] = useState(false);
  // Generation takes tens of seconds; abort it once the panel closes (component unmounts) so the request doesn't keep running in the background
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    const ctrl = new AbortController();
    void coverServiceState(canCover, ctrl.signal).then((s) => {
      if (!ctrl.signal.aborted) setService(s);
    });
    return () => ctrl.abort();
  }, [canCover]);

  const run = async () => {
    running.current?.abort();
    const ctrl = new AbortController();
    running.current = ctrl;
    setBusy(true);
    setError("");
    setImage("");
    // Only remember once Generate is actually pressed: the same person writing the next article likely uses the same two products and colors
    writeSaved(saved);
    const right = saved.rightName.trim();
    try {
      const [one] = await generateCovers(
        {
          title: title.trim(),
          highlights: highlights.map((h) => h.trim()).filter((h) => h !== ""),
          left: { name: saved.leftName.trim(), color: saved.leftColor },
          ...(right ? { right: { name: right, color: saved.rightColor } } : {}),
        },
        ctrl.signal
      );
      setImage(one);
    } catch (e) {
      // Being aborted ourselves (panel closed, 「再来一次」 clicked) isn't an error, no need to report it
      if (ctrl.signal.aborted) return;
      // Eligibility revoked (permission turned off in admin, session expired): clicking again won't help, so switch to that screen instead of leaving a clickable button
      if (e instanceof CoverGenerateError && (e.code === "forbidden" || e.code === "unauthorized")) {
        setDenied(e.message);
        setService("forbidden");
        return;
      }
      setError(e instanceof Error ? e.message : t("生成失败"));
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  const pick = async () => {
    setSaving(true);
    try {
      await onUse(dataUrlToFile(image));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("保存失败"));
    } finally {
      setSaving(false);
    }
  };

  if (service === "checking")
    return (
      <p className={`${tip} flex items-center gap-1.5`}>
        <Loader2 size={14} className="animate-spin" />
        {t("正在检查…")}
      </p>
    );
  if (service === "offline") return <p className={tip}>{t("现在连不上服务器，稍后再试")}</p>;
  if (service === "unconfigured") return <p className={tip}>{t("服务端还没有配置 AI 生成封面")}</p>;
  if (service === "forbidden")
    return <p className={tip}>{denied ? t(denied) : t("你的账号还没开通 AI 生成封面，找管理员开通")}</p>;

  return (
    <div className="flex flex-col gap-2 px-3 pb-2 pt-2">
      <input
        className={inputCls}
        placeholder={t("封面上的标题")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex items-center gap-2">
        {([0, 1] as const).map((i) => (
          <input
            key={i}
            className={inputCls}
            placeholder={t("重点词（可不填）")}
            value={highlights[i]}
            onChange={(e) =>
              setHighlights((prev) => {
                const next: [string, string] = [...prev];
                next[i] = e.target.value;
                return next;
              })
            }
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          className={inputCls}
          placeholder={t("产品 / 模型名称（可不填）")}
          value={saved.leftName}
          onChange={(e) => setSaved({ ...saved, leftName: e.target.value })}
        />
        <Swatches value={saved.leftColor} onPick={(c) => setSaved({ ...saved, leftColor: c })} />
      </div>
      <div className="flex items-center gap-2">
        <input
          className={inputCls}
          placeholder={t("对比的另一方（可不填）")}
          value={saved.rightName}
          onChange={(e) => setSaved({ ...saved, rightName: e.target.value })}
        />
        <Swatches value={saved.rightColor} onPick={(c) => setSaved({ ...saved, rightColor: c })} />
      </div>

      {busy ? (
        <>
          <div className="animate-pulse rounded-md bg-[var(--accent-wash)]" style={COVER_RATIO} />
          <p className="text-[12px] text-[var(--ink-faint)]">{t("正在生成，大约需要十几秒…")}</p>
        </>
      ) : null}

      {image ? (
        <button
          className={coverTileCls}
          style={COVER_RATIO}
          title={t("设为封面")}
          disabled={saving}
          onClick={() => void pick()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
          {saving ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/35">
              <Loader2 size={16} className="animate-spin text-white" />
            </span>
          ) : null}
        </button>
      ) : null}

      {error ? (
        <p className="text-[12px] leading-5 text-[var(--danger,#d9534f)]">{t(error)}</p>
      ) : null}

      <button
        className="flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-[12px] text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
        disabled={busy || saving || title.trim() === ""}
        onClick={() => void run()}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <AiIcon size={14} />}
        {busy ? t("正在生成…") : image ? t("再来一次") : t("生成")}
      </button>
    </div>
  );
}
