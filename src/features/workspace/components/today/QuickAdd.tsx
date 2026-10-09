"use client";

/**
 * 「要做」栏顶上的快速输入：点那一行就地变成输入行，写完回车即记下。
 *
 * 默认是独立待办——日常要做的事不一定属于哪篇文章，记的时候不该被逼着选「记到哪」。
 * 独立待办仍落在一篇隐藏的待办清单文章里：借文章的存储与同步，跨设备免费，
 * 而那篇在文库层就被滤掉了，用户看不见它。
 * 关联文章是可选的次级动作：右侧「关联文章」点开才出搜索，有的事明确属于某篇稿子
 * （「补第三节的数据」）就关联上那篇——任务仍记在清单里，行尾带 `[[docId]]`，
 * 今天页上点它能跳过去；搜不到还可以就地新建一篇再关联。
 */
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import type { DocMeta } from "../../types";
import { DocPicker, type Option } from "./DocPicker";

/**
 * 任务记到哪：一律记进待办清单（有就追加、没有就建），可选关联一篇现有文章（link）；
 * 或以搜索词为标题新建一篇再关联上。
 */
export type AddTarget = { kind: "notes"; link?: string } | { kind: "new"; title: string };

const NOTES: AddTarget = { kind: "notes" };

/** 输入行下方的文章选择器外框 */
function Picker({ docs, onPick }: { docs: DocMeta[]; onPick: (o: Option) => void }) {
  const t = useT();
  return (
    <div
      role="dialog"
      aria-label={t("关联文章")}
      className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-2 text-[13px] shadow-lg"
    >
      <DocPicker docs={docs} onPick={onPick} />
    </div>
  );
}

/**
 * 打开态的输入行（连同选择器）。关掉即卸载，下次打开是全新的状态，目标也回到独立待办。
 */
function InputRow({
  docs,
  onSubmit,
  onClose,
}: {
  docs: DocMeta[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<AddTarget>(NOTES);
  /** 关联文章时右侧标签的文字；默认目标不显示标签 */
  const [targetLabel, setTargetLabel] = useState("");
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState(false);
  const t = useT();
  useDismissMenu(rowRef, onClose, true);
  // Esc 分两级：选择器开着先只关选择器，回到输入行；否则关掉整个输入行
  useEscape(() => {
    if (picking) {
      setPicking(false);
      inputRef.current?.focus();
    } else onClose();
  });

  const submit = async () => {
    if (pending || !text.trim()) return;
    // 提交中锁住：清单那篇还没建好时连敲两次回车会建出两篇「待办清单」
    setPending(true);
    const ok = await onSubmit(text, target);
    setPending(false);
    if (ok) onClose();
    else inputRef.current?.focus(); // 失败不关、字不清，焦点回去方便重试
  };

  const pick = (o: Option) => {
    setTarget(o.pick.kind === "new" ? o.pick : { kind: "notes", link: o.pick.id });
    setTargetLabel(o.pick.kind === "new" ? o.label : t("《{title}》", { title: o.label }));
    setPicking(false);
    // 选完让用户接着打字或直接回车
    inputRef.current?.focus();
  };

  const detach = () => {
    setTarget(NOTES);
    setTargetLabel("");
    inputRef.current?.focus();
  };

  return (
    <div ref={rowRef} className="relative">
      <div
        role="group"
        aria-label={t("记一件事")}
        className="flex items-center gap-2.5 border-b border-[var(--hairline)] px-0.5 py-2"
      >
        <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
        <input
          ref={inputRef}
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
          placeholder={t("要做什么…")}
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 输入法组字时的回车是选词，不能当提交
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submit();
          }}
        />
        {target.kind === "notes" && !target.link ? (
          <button
            type="button"
            className="shrink-0 cursor-pointer text-[12.5px] text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
            disabled={pending}
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
          >
            {t("关联文章")}
          </button>
        ) : (
          <span className="flex max-w-[40%] shrink-0 items-center gap-1 text-[12.5px] text-[var(--ink-soft)]">
            <span className="min-w-0 truncate">{targetLabel}</span>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
              aria-label={t("取消关联")}
              disabled={pending}
              onClick={detach}
            >
              <X size={12} />
            </button>
          </span>
        )}
      </div>
      {picking ? <Picker docs={docs} onPick={pick} /> : null}
    </div>
  );
}

/**
 * 占位行 + 打开态的输入行。
 * 全库没载完时锁住（disabled）：此时找不到清单那篇，提交会误建一篇新的。
 */
export function QuickAdd({
  disabled,
  docs,
  onSubmit,
}: {
  disabled: boolean;
  docs: DocMeta[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="relative mb-1.5">
      {open ? (
        <InputRow docs={docs} onSubmit={onSubmit} onClose={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          // 标成菜单触发器：外部关闭逻辑放它一马，开关由这里自己 toggle
          data-menu-trigger
          className="flex w-full cursor-pointer items-center gap-2.5 border-b border-[var(--hairline)] px-0.5 py-2 text-left text-[14px] text-[var(--ink-faint)] hover:text-[var(--ink-soft)] disabled:cursor-default disabled:opacity-60"
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
          {t("记一件事…")}
        </button>
      )}
    </div>
  );
}
