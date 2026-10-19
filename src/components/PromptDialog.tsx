"use client";

/**
 * Paper-style replacements for prompt / confirm, both built on createDialogHost.
 * Callers just await askInput() / askConfirm() without managing open state and Promises at each call site.
 * Both hosts must be mounted in the root layout; if not mounted, open() resolves a fallback (null / false) immediately so callers never hang.
 */
import { useEffect, useRef, useState } from "react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { PaperDialog } from "./Modal";
import { useT } from "@/i18n/useT";

export interface PromptOptions {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  maxLength?: number;
}

const promptHost = createDialogHost<PromptOptions, string | null>(null);

/** Paper-style input dialog replacing the native prompt(); resolves null on cancel / when the host isn't mounted */
export const askInput = promptHost.open;

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Destructive actions get a red confirm button */
  danger?: boolean;
}

const confirmHost = createDialogHost<ConfirmOptions, boolean>(false);

/** Paper-style confirm dialog replacing the native confirm(); resolves false on cancel / when the host isn't mounted */
export const askConfirm = confirmHost.open;

/** Input dialog host. Mounted in the root layout; renders no DOM when closed. */
export function PromptHost() {
  const t = useT();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Reset the input to this open's default value each time
  const { state, close } = promptHost.useHost((opts) => setValue(opts.defaultValue ?? ""));

  useEffect(() => {
    if (state) {
      // Focus and select the default value on open so it's easy to overwrite
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      // Focus after a short delay: the element just mounted and is mid-entrance animation, so a synchronous focus/select may not take
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!state) return null;

  // All-whitespace input counts as cancel: this dialog's uses (create, rename) don't accept empty names
  const submit = () => {
    const v = value.trim();
    close(v ? v : null);
  };

  return (
    <PaperDialog width={420} onClose={() => close(null)}>
      <div className="px-6 pb-2 pt-5">
        <h3 className="text-[15px] font-semibold [font-family:var(--serif)]">{state.title}</h3>
      </div>
      <div className="px-6 pb-5">
        <input
          ref={inputRef}
          className="h-10 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[14px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
          value={value}
          maxLength={state.maxLength ?? 50}
          placeholder={state.placeholder ?? t("请输入…")}
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
          {t("取消")}
        </button>
        <button
          className="h-9 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-50"
          onClick={submit}
          disabled={!value.trim()}
        >
          {state.confirmText ?? t("确定")}
        </button>
      </div>
    </PaperDialog>
  );
}

/** Confirm dialog host. No internal state; clicking either button resolves and closes. */
export function ConfirmHost() {
  const { state, close } = confirmHost.useHost();
  const t = useT();

  if (!state) return null;

  return (
    <PaperDialog width={400} onClose={() => close(false)}>
      <div className="px-6 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold [font-family:var(--serif)]">{state.title}</h3>
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
          {state.cancelText ?? t("取消")}
        </button>
        <button
          className={`h-9 cursor-pointer rounded-lg px-5 text-[13px] font-medium shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-colors ${
            state.danger
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-deep)]"
          }`}
          onClick={() => close(true)}
        >
          {state.confirmText ?? t("确定")}
        </button>
      </div>
    </PaperDialog>
  );
}
