import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Heading2,
  Image as ImageIcon,
  Lightbulb,
  ListTodo,
  Search,
  SquareCode,
  Table,
  type LucideIcon,
} from "lucide-react";
import type { MockupCopy } from "../content/types";
import { TrafficLights } from "./Section";

/**
 * Hero visual: a static, server-rendered picture of the workspace. Sizes and colors mirror the real app
 * (NavRow rows, SlashMenu popover, live-preview wiki links and callouts) so it reads as a screenshot, not an illustration.
 * No client JS; below 640px the sidebar is dropped and the editor pane fills the window.
 */

const SLASH_ICONS: Record<MockupCopy["slashItems"][number]["icon"], LucideIcon> = {
  h2: Heading2,
  callout: Lightbulb,
  todo: ListTodo,
  table: Table,
  code: SquareCode,
  image: ImageIcon,
};

// Callout colors come from the tip entry in lib/callout.ts; dark mode mixes them the same way live-callout.css does
const CALLOUT =
  "border-l-[3px] border-[#2f8f5b] bg-[#eef8f2] dark:border-[color-mix(in_srgb,#2f8f5b_55%,#fff)] dark:bg-[color-mix(in_srgb,#2f8f5b_16%,transparent)]";
const CALLOUT_HUE = "text-[#2f8f5b] border-[#2f8f5b] dark:text-[color-mix(in_srgb,#2f8f5b_55%,#fff)] dark:border-[color-mix(in_srgb,#2f8f5b_55%,#fff)]";

/** Sidebar row, same metrics as workspace NavRow */
function Row({
  icon,
  label,
  active,
  count,
  indent,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  count?: string;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md py-1.5 pr-2 text-[12.5px] ${indent ? "pl-7" : "pl-2"} ${
        active ? "bg-[var(--sidebar-active)] text-[var(--ink)]" : "text-[var(--ink-soft)]"
      }`}
    >
      <span className="flex w-[14px] shrink-0 justify-center text-[var(--ink-faint)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? <span className="text-[11px] text-[var(--ink-faint)]">{count}</span> : null}
    </div>
  );
}

function Sidebar({ copy }: { copy: MockupCopy }) {
  return (
    <aside className="hidden flex-col gap-0.5 border-r border-[var(--hairline)] bg-[var(--sidebar)] px-2 py-3 sm:flex">
      <div className="mb-2 flex h-7 items-center gap-2 rounded-md border border-[var(--hairline)] bg-[var(--panel)] px-2 text-[12px] text-[var(--ink-faint)]">
        <Search size={12} className="shrink-0" />
        <span className="flex-1 truncate">{copy.searchPlaceholder}</span>
        <kbd className="font-sans text-[10px]">⌘O</kbd>
      </div>
      <Row icon={<CalendarCheck size={14} />} label={copy.today} count={copy.todayCount} />
      <p className="mt-3 px-2 pb-1 text-[11px] text-[var(--ink-faint)]">{copy.foldersLabel}</p>
      {copy.folders.map((f) => (
        <div key={f.name}>
          <Row
            icon={
              <span className="flex items-center">
                {f.docs ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <Folder size={13} className="ml-0.5" />
              </span>
            }
            label={f.name}
          />
          {f.docs?.map((d) => (
            <Row
              key={d}
              icon={<FileText size={13} />}
              label={d}
              active={d === copy.activeDoc}
              indent
            />
          ))}
        </div>
      ))}
    </aside>
  );
}

/** Task row: a native-looking checkbox (accent-colored when checked, like the editor's accent-color checkbox) */
function Task({ text, done, due }: MockupCopy["tasks"][number]) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-[5px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border ${
          done
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
            : "border-[var(--hairline-strong)] bg-[var(--panel)]"
        }`}
        aria-hidden="true"
      >
        {done ? <Check size={10} strokeWidth={3} /> : null}
      </span>
      <span className={done ? "text-[var(--ink-faint)] line-through" : undefined}>
        {text}
        {due ? <span className="ml-1.5 text-[var(--ink-faint)]">@{due}</span> : null}
      </span>
    </li>
  );
}

function SlashMenu({ copy }: { copy: MockupCopy }) {
  return (
    <div className="absolute left-0 top-full z-10 mt-1.5 w-[236px] max-w-[calc(100vw-96px)] rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {copy.slashItems.map((item, i) => {
        const Icon = SLASH_ICONS[item.icon];
        return (
          <div
            key={item.label}
            className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-[var(--ink)] ${
              i === 0 ? "bg-[var(--accent-wash)]" : ""
            }`}
          >
            <Icon size={16} className="shrink-0 text-[var(--ink-soft)]" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-[var(--ink-faint)]">{item.hint}</span>
          </div>
        );
      })}
    </div>
  );
}

function EditorPane({ copy }: { copy: MockupCopy }) {
  return (
    <div className="relative min-w-0 bg-[var(--panel)]">
      {/* Bottom padding leaves room for the slash popover hanging below the last line */}
      <div className="mx-auto max-w-[640px] px-5 pb-[232px] pt-7 text-left sm:px-10 sm:pt-9 lg:pb-[212px]">
        <p className="text-[11.5px] text-[var(--ink-faint)]">
          {copy.breadcrumb} <span className="px-1">/</span> {copy.docTitle}
        </p>
        <p className="mt-3 font-[family-name:var(--serif)] text-[26px] font-semibold leading-[1.3] tracking-[-0.01em] sm:text-[30px]">
          {copy.docTitle}
        </p>
        <p className="mt-4 text-[14.5px] leading-[1.8] text-[var(--ink)] sm:text-[15.5px]">
          {copy.paraBefore}
          {/* Rendered [[wiki link]]: link color + dashed underline, as in live-preview.css */}
          <span className="rounded-[4px] border-b border-dashed border-[color-mix(in_srgb,var(--md-link)_45%,transparent)] bg-[color-mix(in_srgb,var(--md-link)_7%,transparent)] px-0.5 text-[var(--md-link)]">
            {copy.wikiLink}
          </span>
          {copy.paraAfter}
        </p>
        <div className={`mt-4 px-3 py-2 text-[14px] leading-[1.75] text-[var(--ink)] sm:text-[14.5px] ${CALLOUT}`}>
          <span className={`mr-1.5 rounded-[4px] border px-1.5 text-[11.5px] font-semibold ${CALLOUT_HUE}`}>
            {copy.calloutBadge}
          </span>
          {copy.calloutText}
        </div>
        <p className="mt-6 text-[17px] font-semibold sm:text-[18px]">{copy.tasksHeading}</p>
        <ul className="mt-2.5 space-y-1.5 text-[14.5px] leading-[1.75] text-[var(--ink)] sm:text-[15px]">
          {copy.tasks.map((t) => (
            <Task key={t.text} {...t} />
          ))}
        </ul>
        {/* Empty line where the user just typed "/" — caret right after it, menu anchored below */}
        <div className="relative mt-3 text-[15px] leading-[1.75]">
          <span className="text-[var(--ink)]">{copy.slashQuery}</span>
          <span
            className="ml-px inline-block h-[17px] w-[1.5px] translate-y-[3px] bg-[var(--ink)]"
            aria-hidden="true"
          />
          <SlashMenu copy={copy} />
        </div>
      </div>
      <span className="absolute bottom-3 right-4 text-[11px] text-[var(--ink-faint)]">
        {copy.wordCount}
      </span>
    </div>
  );
}

export function AppMockup({ copy }: { copy: MockupCopy }) {
  return (
    // aria-hidden: the window is a picture of the product; its sample text would only be noise to screen readers
    <div className="mx-auto max-w-[1080px]" aria-hidden="true">
      <div className="overflow-hidden rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--panel)] shadow-[0_44px_100px_-48px_rgba(0,0,0,0.5),0_12px_32px_-20px_rgba(0,0,0,0.2)]">
        <div className="relative flex h-10 items-center border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
          <TrafficLights />
          <span className="absolute left-1/2 max-w-[44%] -translate-x-1/2 truncate text-[12px] text-[var(--ink-soft)]">
            {copy.windowTitle}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {copy.syncStatus}
          </span>
        </div>
        <div className="grid sm:grid-cols-[196px_minmax(0,1fr)] lg:grid-cols-[228px_minmax(0,1fr)]">
          <Sidebar copy={copy} />
          <EditorPane copy={copy} />
        </div>
      </div>
    </div>
  );
}
