"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, RefreshCw, Sparkles, Copy as CopyIcon, Check } from "lucide-react";
import { useStore } from "@/store/useStore";
import { chatOnce, streamChat } from "@/lib/ai";
import { useEscape } from "@/hooks/useEscape";
import { toast } from "./Toast";

const headerCls =
  "flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4";
const titleCls = "flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]";
const closeBtnCls =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]";
const primaryBtn =
  "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)] disabled:opacity-50";
const ghostBtn9 =
  "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50";

/** 原文 / AI 结果对照，流式生成，确认后替换 */
export function AiDiffDialog({
  title,
  system,
  original,
  onApply,
  onClose,
}: {
  title: string;
  system: string;
  original: string;
  onApply: (result: string) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(true);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  // 流式生成中禁止 Esc 误关
  useEscape(onClose, !running);

  useEffect(() => {
    const controller = new AbortController();
    streamChat({
      system,
      prompt: original,
      signal: controller.signal,
      onDelta: (full) => {
        setResult(full);
        // 跟随滚动到底部
        const el = resultRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      },
    })
      .then((full) => {
        setResult(full);
        setRunning(false);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "生成失败");
        setRunning(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-[620px] max-h-[90vh] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={headerCls}>
          <span className={titleCls}>
            <Sparkles size={15} className="text-[var(--accent)]" />
            {title}
          </span>
          <button className={closeBtnCls} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto sm:grid-cols-2">
          <div className="flex min-h-0 flex-col border-b border-[var(--hairline)] sm:border-b-0 sm:border-r">
            <p className="shrink-0 px-4 pb-1 pt-2.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
              原文
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 pb-4 text-[13px] leading-6 text-[var(--ink-soft)] [font-family:var(--mono)]">
              {original}
            </div>
          </div>
          <div className="flex min-h-0 flex-col bg-[var(--paper)]">
            <p className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
              AI 结果
              {running ? <Loader2 size={11} className="animate-spin text-[var(--accent)]" /> : null}
            </p>
            <div
              ref={resultRef}
              className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 pb-4 text-[13px] leading-6 text-[var(--ink)] [font-family:var(--mono)]"
            >
              {error ? <span className="text-red-600 dark:text-red-400">{error}</span> : result || "生成中…"}
            </div>
          </div>
        </div>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-[var(--hairline)] px-4">
          <button
            className={ghostBtn9}
            onClick={() => {
              setRunning(true);
              setError("");
              setResult("");
              setRound((r) => r + 1);
            }}
            disabled={running}
          >
            <RefreshCw size={13} />
            重新生成
          </button>
          <button className={ghostBtn9} onClick={onClose}>
            取消
          </button>
          <button
            className={primaryBtn}
            disabled={running || Boolean(error) || !result.trim()}
            onClick={() => {
              onApply(result.trim());
              onClose();
            }}
          >
            <Check size={14} />
            替换原文
          </button>
        </div>
      </div>
    </div>
  );
}

const TITLES_SYSTEM =
  "你是资深微信公众号编辑。为用户提供的文章生成 8 个候选标题：信息准确、有点开欲、不超过 30 字，避免夸大和违规词，风格各有差异（悬念式、数字式、观点式、干货式等）。只输出 8 行，每行一个标题，不要编号、引号或任何解释。";

/** AI 起标题：候选列表，点击应用 */
export function AiTitlesDialog({ onClose }: { onClose: () => void }) {
  const setTitle = useStore((s) => s.setTitle);
  const [titles, setTitles] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  // 生成中（无结果无报错）禁止 Esc 误关
  useEscape(onClose, Boolean(titles || error));

  useEffect(() => {
    let cancelled = false;
    const content = useStore.getState().content.slice(0, 20000);
    chatOnce({ system: TITLES_SYSTEM, prompt: content })
      .then((text) => {
        if (cancelled) return;
        const list = text
          .split("\n")
          .map((l) => l.replace(/^\s*\d+[.、)]?\s*/, "").replace(/^["'「『]|["'」』]$/g, "").trim())
          .filter(Boolean)
          .slice(0, 10);
        if (list.length === 0) throw new Error("未解析到标题");
        setTitles(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "生成失败");
      });
    return () => {
      cancelled = true;
    };
  }, [round]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[520px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={headerCls}>
          <span className={titleCls}>
            <Sparkles size={15} className="text-[var(--accent)]" />
            AI 起标题
          </span>
          <div className="flex items-center gap-1">
            {titles || error ? (
              <button
                className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
                onClick={() => {
                  setTitles(null);
                  setError("");
                  setRound((r) => r + 1);
                }}
              >
                <RefreshCw size={13} />
                换一批
              </button>
            ) : null}
            <button className={closeBtnCls} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {!titles && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--ink-faint)]">
            <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
            正在根据全文生成候选标题…
          </div>
        ) : error ? (
          <p className="px-6 py-12 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {titles!.map((t, i) => (
              <button
                key={i}
                className="group flex w-full cursor-pointer items-start gap-3 px-5 py-2.5 text-left hover:bg-[var(--paper)]"
                onClick={() => {
                  setTitle(t);
                  toast("已应用为文章标题", "success");
                  onClose();
                }}
              >
                <span className="mt-0.5 text-[11px] text-[var(--accent)] [font-family:var(--mono)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[13.5px] leading-6 text-[var(--ink)] group-hover:text-[var(--accent-deep)]">
                  {t}
                </span>
                <span className="mt-1 text-[11px] text-[var(--ink-faint)]">{t.length} 字</span>
              </button>
            ))}
            <p className="px-5 pb-3 pt-2 text-[11.5px] text-[var(--ink-faint)]">
              点击任意标题应用到文章；公众号标题建议 ≤ 30 字
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const SUMMARY_SYSTEM =
  "你是资深微信公众号编辑。为文章写一段公众号摘要：100~120 字、单段、无标题无引号，概括文章核心价值、制造点开动机。只输出摘要本身。";

/** AI 摘要 */
export function AiSummaryDialog({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(true);
  const [copied, setCopied] = useState(false);
  const [round, setRound] = useState(0);
  // 生成中禁止 Esc 误关
  useEscape(onClose, !running);

  useEffect(() => {
    let cancelled = false;
    const content = useStore.getState().content.slice(0, 20000);
    chatOnce({ system: SUMMARY_SYSTEM, prompt: content })
      .then((text) => {
        if (cancelled) return;
        setSummary(text.trim());
        setRunning(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "生成失败");
        setRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [round]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[94vw] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={headerCls}>
          <span className={titleCls}>
            <Sparkles size={15} className="text-[var(--accent)]" />
            AI 公众号摘要
          </span>
          <button className={closeBtnCls} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          {running ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-[var(--ink-faint)]">
              <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
              生成中…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="rounded-lg bg-[var(--paper)] px-4 py-3.5 text-[13.5px] leading-7 text-[var(--ink)]">
                {summary}
              </p>
              <p className="mt-2 text-right text-[11.5px] text-[var(--ink-faint)]">
                {summary.replace(/\s/g, "").length} 字 · 公众号摘要上限 120 字
              </p>
            </>
          )}
        </div>

        <div className="flex h-14 items-center justify-end gap-2 border-t border-[var(--hairline)] px-4">
          <button
            className={ghostBtn9}
            onClick={() => {
              setRunning(true);
              setError("");
              setSummary("");
              setCopied(false);
              setRound((r) => r + 1);
            }}
            disabled={running}
          >
            <RefreshCw size={13} />
            重新生成
          </button>
          <button
            className={primaryBtn}
            disabled={running || Boolean(error)}
            onClick={() => {
              void navigator.clipboard.writeText(summary).then(() => {
                setCopied(true);
                toast("摘要已复制，粘贴到公众号摘要栏", "success");
              });
            }}
          >
            {copied ? <Check size={14} /> : <CopyIcon size={14} />}
            复制摘要
          </button>
        </div>
      </div>
    </div>
  );
}
