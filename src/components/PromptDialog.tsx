"use client";

/**
 * 稿纸风格的 prompt / confirm 替代品，两者共用 createDialogHost。
 * 业务侧只 await askInput() / askConfirm()，不必在每个调用处自己维护开关状态和 Promise。
 * 两个 Host 都必须挂在根布局；没挂载时 open() 会立刻 resolve 兜底值（null / false），调用方不会卡死。
 */
import { useEffect, useRef, useState } from "react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { PaperDialog } from "./Modal";

export interface PromptOptions {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  maxLength?: number;
}

const promptHost = createDialogHost<PromptOptions, string | null>(null);

/** 稿纸风格的输入对话框，替代浏览器原生 prompt()；取消 / 宿主未挂载时 resolve null */
export const askInput = promptHost.open;

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作用红色确认按钮 */
  danger?: boolean;
}

const confirmHost = createDialogHost<ConfirmOptions, boolean>(false);

/** 稿纸风格的确认对话框，替代浏览器原生 confirm()；取消 / 宿主未挂载时 resolve false */
export const askConfirm = confirmHost.open;

/** 输入弹窗宿主。挂在根布局，未打开时不渲染任何 DOM。 */
export function PromptHost() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // 每次打开按本次的默认值重置输入框
  const { state, close } = promptHost.useHost((opts) => setValue(opts.defaultValue ?? ""));

  useEffect(() => {
    if (state) {
      // 弹出后聚焦并选中默认值，便于直接改写
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      // 延后一小会儿再聚焦：元素刚挂载且正在走入场动画，同步调 focus/select 不一定生效
      }, 20);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!state) return null;

  // 全空白输入按取消处理：这个弹窗的用处（新建、重命名）都不接受空名字
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
          className="h-9 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-50"
          onClick={submit}
          disabled={!value.trim()}
        >
          {state.confirmText ?? "确定"}
        </button>
      </div>
    </PaperDialog>
  );
}

/** 确认弹窗宿主。没有内部状态，点任一按钮即 resolve 并关闭。 */
export function ConfirmHost() {
  const { state, close } = confirmHost.useHost();

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
          {state.cancelText ?? "取消"}
        </button>
        <button
          className={`h-9 cursor-pointer rounded-lg px-5 text-[13px] font-medium shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-colors ${
            state.danger
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-deep)]"
          }`}
          onClick={() => close(true)}
        >
          {state.confirmText ?? "确定"}
        </button>
      </div>
    </PaperDialog>
  );
}
