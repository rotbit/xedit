"use client";

/**
 * 「记一件事」时可选的关联目标，左栏快速输入（QuickAdd）和右栏每天末尾的输入行（UpcomingColumn）共用。
 *
 * 两处的交互必须一致：默认独立待办，右侧「关联文章」点开才出搜索，选中后显示《标题》+ X 可撤回；
 * 抽到这里是为了不让两份拷贝各自走样。状态与渲染分开：useAddTarget 管选了什么，
 * TargetControl 只负责画右侧那块，各输入行自己决定选择器何时开、怎么关。
 */
import { useState, type RefObject } from "react";
import { X } from "lucide-react";
import { askCategoryPick } from "@/components/CategoryPickDialog";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { displayCatName, nameOf } from "../../lib/catPath";
import type { DocMeta } from "../../types";
import { DocPicker, type Option } from "./DocPicker";

/**
 * 任务记到哪：一律记进待办清单（有就追加、没有就建），可选关联一篇现有文章（link）；
 * 或新建一篇再关联上——title 为空串时用任务文字当标题，category 是选好的文件夹。
 */
export type AddTarget = { kind: "notes"; link?: string } | { kind: "new"; title: string; category: string };

export const NOTES: AddTarget = { kind: "notes" };

/** 是否还是默认目标（独立待办、没关联任何文章） */
export const isDefaultTarget = (target: AddTarget) => target.kind === "notes" && !target.link;

/**
 * 选择器里点了「新建」后问落到哪个文件夹，三处（行尾关联、快速输入、每天末尾）共用。
 * 返回分类路径，null = 取消。调用方各自先收起自己的弹层再 await 它——
 * 弹窗是全局宿主，不依赖调用方还挂着，所以行尾弹层关掉即卸载也不影响后续回调。
 */
export function askNewDocFolder(categories: string[], t: TFn): Promise<string | null> {
  return askCategoryPick({ title: t("新建文章到哪个文件夹"), categories });
}

/** 输入行下方的文章选择器外框 */
export function Picker({ docs, onPick }: { docs: DocMeta[]; onPick: (o: Option) => void }) {
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
 * 关联目标的状态：选了什么（target）、右侧标签文字（targetLabel）、选择器开没开（picking）、
 * 文件夹弹窗开没开（choosingFolder）。选中 / 取消之后焦点还给输入框，让用户接着打字或直接回车。
 *
 * choosingFolder 要交给输入行：弹窗是 modal，点在弹窗里对输入行来说是「外部点击」，
 * Esc 也会同时传到输入行——不挂起它们的关闭逻辑，输入行就会被收起（快速输入那行还会卸载、字丢掉）。
 */
export function useAddTarget(inputRef: RefObject<HTMLInputElement | null>, categories: string[]) {
  const t = useT();
  const [target, setTarget] = useState<AddTarget>(NOTES);
  /** 关联文章时右侧标签的文字；默认目标不显示标签 */
  const [targetLabel, setTargetLabel] = useState("");
  const [picking, setPicking] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);

  const pick = async (o: Option) => {
    setPicking(false);
    if (o.pick.kind === "doc") {
      setTarget({ kind: "notes", link: o.pick.id });
      setTargetLabel(t("《{title}》", { title: o.label }));
      inputRef.current?.focus();
      return;
    }
    const { title } = o.pick;
    setChoosingFolder(true);
    const category = await askNewDocFolder(categories, t);
    setChoosingFolder(false);
    // 取消就当没点过「新建」：目标保持原样
    if (category !== null) {
      setTarget({ kind: "new", title, category });
      // 带上文件夹末级名：不然选完看不出落到哪，提交前也没机会发现选错了
      const what = title ? t("新建《{title}》", { title }) : t("新建文章");
      setTargetLabel(`${what} · ${displayCatName(nameOf(category), t)}`);
    }
    inputRef.current?.focus();
  };

  const detach = () => {
    setTarget(NOTES);
    setTargetLabel("");
    inputRef.current?.focus();
  };

  /** 提交成功后回到默认：连记时每条各自选关联，不沿用上一条的 */
  const reset = () => {
    setTarget(NOTES);
    setTargetLabel("");
    setPicking(false);
  };

  return { target, targetLabel, picking, setPicking, choosingFolder, pick, detach, reset };
}

const SIZES = {
  md: { text: "text-[12.5px]", icon: 12, maxW: "max-w-[40%]" },
  sm: { text: "text-[11.5px]", icon: 11, maxW: "max-w-[45%]" },
} as const;

/**
 * 输入行右侧那块：默认目标时是「关联文章」文字按钮，选了文章后是《标题》+ X。
 * md 配左栏 14px 的输入行，sm 配右栏 12px 的。
 */
export function TargetControl({
  target,
  label,
  picking,
  pending,
  size,
  onToggle,
  onDetach,
  className = "",
}: {
  target: AddTarget;
  label: string;
  picking: boolean;
  pending: boolean;
  size: "md" | "sm";
  onToggle: () => void;
  onDetach: () => void;
  className?: string;
}) {
  const t = useT();
  const s = SIZES[size];
  if (isDefaultTarget(target)) {
    return (
      <button
        type="button"
        className={`shrink-0 cursor-pointer ${s.text} text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60 ${className}`}
        disabled={pending}
        aria-expanded={picking}
        onClick={onToggle}
      >
        {t("关联文章")}
      </button>
    );
  }
  return (
    <span className={`flex ${s.maxW} shrink-0 items-center gap-1 ${s.text} text-[var(--ink-soft)] ${className}`}>
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
        aria-label={t("取消关联")}
        disabled={pending}
        onClick={onDetach}
      >
        <X size={s.icon} />
      </button>
    </span>
  );
}
