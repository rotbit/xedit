"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
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
 * 封面选择器的「AI 生成」页签：填好标题、重点词和要对比的两个产品，交给本站的
 * /api/cover/generate 生图（提示词是服务端写死的模板，这里只提供填空）。
 * 一次只生一张，不行就再点一次「再来一次」；看中了就走存图那条路。
 * Replicate Token 在服务端（浏览器拿不到），生图又花的是站点的钱、只对管理员开放，
 * 所以这里先问一句站点配没配、自己够不够格。
 */

const tip = "px-3 pb-3 pt-2 text-[12px] leading-relaxed text-[var(--ink-soft,var(--ink-faint))]";

const inputCls =
  "h-7 w-full min-w-0 rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2 text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]";

/** 记在本地的那几项：产品名和配色多半几篇文章都一样，标题和重点词每篇都不同，不记 */
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

/** 读不出来、存不进去（隐私模式、配额满了）都当没记过，表单照常能用 */
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
    // 记不住下次重填就是了，不值得打断生成
  }
}

/** 一排小圆色点，选中的那个套一圈环 */
function Swatches({ value, onPick }: { value: CoverColor; onPick: (color: CoverColor) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {COVER_COLORS.map((c) => (
        <button
          key={c.id}
          title={c.label}
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
  /** 挑中的图交给调用方去存（有文库存文库，否则传云端）并设为封面；失败它自己弹提示 */
  onUse,
}: {
  onUse: (file: File) => Promise<void>;
}) {
  const isAdmin = useSession().data?.user?.isAdmin === true;
  const [service, setService] = useState<CoverServiceState | "checking">("checking");
  /** forbidden 那一屏上显示的话：接口回过就用服务端的说法，没有就用默认那句 */
  const [denied, setDenied] = useState("");
  // 标题只在打开页签时从文章那边预填一次：封面上的标题可以和文章标题不一样，改过就不该被冲掉
  const [title, setTitle] = useState(() => useStore.getState().title);
  const [highlights, setHighlights] = useState<[string, string]>(["", ""]);
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** 这一轮生出来的那张（空串 = 还没生过）*/
  const [image, setImage] = useState("");
  /** 正在存这张：转圈要盖在图上 */
  const [saving, setSaving] = useState(false);
  // 生图要几十秒，面板一关（组件卸载）就掐掉，别让请求在后台空跑
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    const ctrl = new AbortController();
    void coverServiceState(isAdmin, ctrl.signal).then((s) => {
      if (!ctrl.signal.aborted) setService(s);
    });
    return () => ctrl.abort();
  }, [isAdmin]);

  const run = async () => {
    running.current?.abort();
    const ctrl = new AbortController();
    running.current = ctrl;
    setBusy(true);
    setError("");
    setImage("");
    // 真按了生成才记：同一个人接着写下一篇，多半还是这两个产品、这两个颜色
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
      // 自己被 abort 掉（关面板、点了「再来一次」）不是错，不用报
      if (ctrl.signal.aborted) return;
      // 资格被收回（管理员名单改了、会话过期）：再点也没用，直接换成那一屏，别留个还能点的按钮
      if (e instanceof CoverGenerateError && (e.code === "forbidden" || e.code === "unauthorized")) {
        setDenied(e.message);
        setService("forbidden");
        return;
      }
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  const pick = async () => {
    setSaving(true);
    try {
      await onUse(dataUrlToFile(image));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (service === "checking")
    return (
      <p className={`${tip} flex items-center gap-1.5`}>
        <Loader2 size={13} className="animate-spin" />
        正在检查…
      </p>
    );
  if (service === "offline") return <p className={tip}>现在连不上服务器，稍后再试</p>;
  if (service === "unconfigured") return <p className={tip}>服务端还没有配置 AI 生成封面</p>;
  if (service === "forbidden")
    return <p className={tip}>{denied || "AI 生成封面目前只对管理员开放"}</p>;

  return (
    <div className="flex flex-col gap-2 px-3 pb-2 pt-2">
      <input
        className={inputCls}
        placeholder="封面上的标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex items-center gap-2">
        {([0, 1] as const).map((i) => (
          <input
            key={i}
            className={inputCls}
            placeholder="重点词（可不填）"
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
          placeholder="产品 / 模型名称"
          value={saved.leftName}
          onChange={(e) => setSaved({ ...saved, leftName: e.target.value })}
        />
        <Swatches value={saved.leftColor} onPick={(c) => setSaved({ ...saved, leftColor: c })} />
      </div>
      <div className="flex items-center gap-2">
        <input
          className={inputCls}
          placeholder="对比的另一方（可不填）"
          value={saved.rightName}
          onChange={(e) => setSaved({ ...saved, rightName: e.target.value })}
        />
        <Swatches value={saved.rightColor} onPick={(c) => setSaved({ ...saved, rightColor: c })} />
      </div>

      {busy ? (
        <>
          <div className="animate-pulse rounded-md bg-[var(--accent-wash)]" style={COVER_RATIO} />
          <p className="text-[12px] text-[var(--ink-faint)]">正在生成，大约需要十几秒…</p>
        </>
      ) : null}

      {image ? (
        <button
          className={coverTileCls}
          style={COVER_RATIO}
          title="设为封面"
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
        <p className="text-[12px] leading-5 text-[var(--danger,#d9534f)]">{error}</p>
      ) : null}

      <button
        className="flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-[12px] text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
        disabled={busy || saving || title.trim() === "" || saved.leftName.trim() === ""}
        onClick={() => void run()}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {busy ? "正在生成…" : image ? "再来一次" : "生成"}
      </button>
    </div>
  );
}
