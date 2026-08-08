"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "@/components/Toast";
import { useEscape } from "@/hooks/useEscape";

interface ShareState {
  enabled: boolean;
  token?: string;
  allowComment?: boolean;
  commentCount?: number;
}

/**
 * 分享设置弹窗：开启后生成永久有效的公开链接（只由作者手动关闭），
 * 访客打开即看到公众号真实渲染效果，无需登录即可选中文字批注。
 */
export function ShareDialog({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [state, setState] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  /** 尚未开启时的批注意向：开启那一刻随请求带上，省得开完再回来勾一次 */
  const [wantComment, setWantComment] = useState(true);
  useEscape(onClose);

  const load = useCallback(async (): Promise<ShareState | null> => {
    const res = await fetch(`/api/documents/${docId}/share`);
    if (!res.ok) {
      toast("加载分享状态失败", "error");
      return null;
    }
    return res.json();
  }, [docId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((s) => {
      if (!cancelled && s) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const call = async (fn: () => Promise<Response>, okMsg?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        setState(await res.json());
        if (okMsg) toast(okMsg, "success");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? "操作失败", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    call(
      () =>
        fetch(`/api/documents/${docId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowComment: wantComment }),
        }),
      "分享已开启，链接永久有效"
    );
  const disable = () =>
    call(() =>
      fetch(`/api/documents/${docId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      })
    );
  const setAllowComment = (allow: boolean) =>
    call(() =>
      fetch(`/api/documents/${docId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowComment: allow }),
      })
    );

  const url = state?.token ? `${window.location.origin}/s/${state.token}` : "";
  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    toast("链接已复制", "success");
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="text-[14px] font-medium [font-family:var(--serif)]">分享文章</span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {state === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-[var(--ink-faint)]">
              <Loader2 size={15} className="animate-spin" /> 加载中…
            </div>
          ) : !state.enabled ? (
            <>
              <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
                生成一个公开链接，任何人打开都能看到这篇文章的
                <b>公众号真实渲染效果</b>，并可以像飞书一样对文字、图片、视频批注——无需注册登录。
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[12px] leading-relaxed text-[var(--ink-faint)]">
                <li>· 链接永久有效，不会自动过期，随时可以手动关闭</li>
                <li>· 分享页按你当前的排版主题渲染，正文实时跟随文章更新</li>
                <li>· 关闭后重新开启会生成新链接，旧链接立刻失效；已有批注保留</li>
              </ul>
              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-[var(--hairline)] px-3 py-2.5">
                <span className="text-[13px] text-[var(--ink)]">
                  允许访客批注
                  <span className="ml-2 text-[12px] text-[var(--ink-faint)]">
                    关闭则正文更宽
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                  checked={wantComment}
                  disabled={busy}
                  onChange={(e) => setWantComment(e.target.checked)}
                />
              </label>
              <button
                className="mt-3 w-full cursor-pointer rounded-lg bg-[var(--accent)] py-2.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-45"
                disabled={busy}
                onClick={() => void enable()}
              >
                开启分享（永久有效）
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3 text-[12px] text-[var(--ink)] outline-none"
                  value={url}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:opacity-90"
                  onClick={() => void copyUrl()}
                >
                  <Copy size={13} />
                  复制
                </button>
              </div>

              <p className="mt-3 text-[12px] text-[var(--ink-faint)]">
                链接永久有效
                {typeof state.commentCount === "number" && state.commentCount > 0
                  ? ` · ${state.commentCount} 条批注`
                  : ""}
              </p>

              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-[var(--hairline)] px-3 py-2.5">
                <span className="text-[13px] text-[var(--ink)]">
                  允许访客批注
                  <span className="ml-2 text-[12px] text-[var(--ink-faint)]">
                    关闭则正文更宽
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                  checked={state.allowComment ?? true}
                  disabled={busy}
                  onChange={(e) => void setAllowComment(e.target.checked)}
                />
              </label>

              <div className="mt-4 flex items-center justify-between">
                <button
                  className="cursor-pointer text-[12px] text-red-500 hover:underline disabled:opacity-45"
                  disabled={busy}
                  onClick={() => void disable()}
                >
                  关闭分享
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
                >
                  打开分享页
                  <ExternalLink size={12} />
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
