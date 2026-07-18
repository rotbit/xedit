"use client";

import { useEffect, useRef, useState } from "react";

export interface PromptOptions {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  maxLength?: number;
}

interface PromptState extends PromptOptions {
  resolve: (value: string | null) => void;
}

let opener: ((opts: PromptOptions) => Promise<string | null>) | null = null;

/** 稿纸风格的输入对话框，替代浏览器原生 prompt() */
export function askInput(opts: PromptOptions): Promise<string | null> {
  if (!opener) return Promise.resolve(null);
  return opener(opts);
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作用红色确认按钮 */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let confirmOpener: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

/** 稿纸风格的确认对话框，替代浏览器原生 confirm() */
export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (!confirmOpener) return Promise.resolve(false);
  return confirmOpener(opts);
}

export function PromptHost() {
  const [state, setState] = useState<PromptState | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    opener = (opts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setState({ ...opts, resolve });
      });
    return () => {
      opener = null;
    };
  }, []);

  useEffect(() => {
    if (state) {
      // 弹出后聚焦并选中默认值，便于直接改写
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!state) return null;

  const close = (result: string | null) => {
    state.resolve(result);
    setState(null);
  };

  const submit = () => {
    const v = value.trim();
    close(v ? v : null);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
      onClick={() => close(null)}
    >
      <div
        className="toast-in w-[420px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-2 pt-5">
          <h3 className="text-[15px] font-semibold [font-family:var(--serif)]">
            {state.title}
          </h3>
        </div>
        <div className="px-6 pb-5">
          <input
            ref={inputRef}
            className="h-10 w-full rounded-lg border border-[var(--hairline-strong)] bg-white px-3 text-[14px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
            value={value}
            maxLength={state.maxLength ?? 50}
            placeholder={state.placeholder ?? "请输入…"}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") close(null);
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-5 py-3">
          <button
            className="h-9 cursor-pointer rounded-lg px-4 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            onClick={() => close(null)}
          >
            取消
          </button>
          <button
            className="h-9 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(192,57,43,0.35)] transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-50"
            onClick={submit}
            disabled={!value.trim()}
          >
            {state.confirmText ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    confirmOpener = (opts) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve });
      });
    return () => {
      confirmOpener = null;
    };
  }, []);

  if (!state) return null;

  const close = (ok: boolean) => {
    state.resolve(ok);
    setState(null);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
      onClick={() => close(false)}
    >
      <div
        className="toast-in w-[400px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-4 pt-5">
          <h3 className="text-[15px] font-semibold [font-family:var(--serif)]">
            {state.title}
          </h3>
          {state.message ? (
            <p className="mt-2 whitespace-pre-line text-[13px] leading-6 text-[var(--ink-soft)]">
              {state.message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-5 py-3">
          <button
            className="h-9 cursor-pointer rounded-lg px-4 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            onClick={() => close(false)}
          >
            {state.cancelText ?? "取消"}
          </button>
          <button
            className={`h-9 cursor-pointer rounded-lg px-5 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-colors ${
              state.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--accent)] hover:bg-[var(--accent-deep)]"
            }`}
            onClick={() => close(true)}
          >
            {state.confirmText ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}
