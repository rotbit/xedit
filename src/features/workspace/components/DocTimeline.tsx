"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { useLocale, useT } from "@/i18n/useT";
import { ALL, UNCATEGORIZED } from "../constants";
import { displayCatName, displayCatPath } from "../lib/catPath";
import { groupByRecency, isDayHeading, showsRelativeTime } from "../lib/recencyGroups";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 列表摘要是服务端粗剥的纯文本，里面常剩整条长链接，行上只显示域名，别让 URL 把版面撑乱 */
function cleanExcerpt(s: string): string {
  return s
    .replace(/https?:\/\/([^\s/?#]+)[^\s]*/g, (_, host: string) => {
      const parts = host.replace(/^www\./, "").split(".");
      return `‹${parts.slice(-2).join(".")}›`;
    })
    // 身份证号、订单号这类长数字串只留前 4 位，既不撑版面也不在列表里裸露
    .replace(/\d{12,}/g, (m) => `${m.slice(0, 4)}…`)
    .replace(/\\_/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/** 回收站行右侧的恢复 / 彻底删除：行布局里不再需要分隔线，压成一排贴边小按钮 */
function TrashActions({ ws, doc }: { ws: Workspace; doc: DocMeta }) {
  const { docActions } = ws;
  const t = useT();
  return (
    <div className="flex shrink-0 gap-1.5 pt-0.5">
      <button
        className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-2 py-0.5 text-[11.5px] text-[var(--ink)] hover:bg-[var(--paper)]"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.restoreDoc(doc);
        }}
      >
        {t("恢复")}
      </button>
      <button
        className="cursor-pointer rounded-md px-2 py-0.5 text-[11.5px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.hardDeleteDoc(doc);
        }}
      >
        {t("彻底删除")}
      </button>
    </div>
  );
}

/** 时间流里的一篇：左边标题 + 单行摘要，右边浅字文件夹与字数，无边框只靠留白分隔。
 *  showTime：只有今天 / 昨天两组在字数前带相对时间，更早的组左栏已经说清了时间。
 *  at：这一行的时间（「最近打开」视图是 max(打开, 编辑)，其它视图是 updatedAt），由 ws.timeOf 给出
 *  名字别再叫 DocRow——侧栏树里那个同名组件是另一套布局（components/DocRow.tsx） */
function TimelineRow({
  ws,
  doc,
  showTime,
  at,
}: {
  ws: Workspace;
  doc: DocMeta;
  showTime: boolean;
  at: string;
}) {
  const { nav, menus, drag } = ws;
  const { isTrash } = nav;
  const t = useT();
  const cat = doc.category || UNCATEGORIZED;
  const excerpt = cleanExcerpt(doc.excerpt || "");
  const chars = typeof doc.chars === "number" ? doc.chars : 0;
  // 回收站行右侧只有两个按钮，少一条空的轨道，免得白白多出一份 gap
  const cols = isTrash
    ? "grid-cols-[minmax(0,1fr)_auto]"
    : "grid-cols-[minmax(0,1fr)_auto_auto]";
  return (
    <div
      className={`group relative -mx-3 grid ${cols} items-start gap-5 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-[var(--accent-wash)] ${
        isTrash ? "" : "cursor-pointer"
      } ${drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""}`}
      onClick={() => {
        // 回收站里的行点不开：那里只有恢复 / 彻底删除两个按钮
        if (!isTrash) nav.openDoc(doc.id);
      }}
      onContextMenu={isTrash ? undefined : (e) => menus.openDocMenuAt(e, doc.id)}
      {...(isTrash ? {} : drag.dragSrcProps({ kind: "doc", id: doc.id }))}
    >
      <div className="min-w-0">
        <p className="truncate text-[15.5px] font-semibold leading-[1.4] text-[var(--ink)]">
          {doc.title || t(UNTITLED_DOC)}
        </p>
        <p
          className={`mt-0.5 truncate text-[13px] ${
            excerpt ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"
          }`}
        >
          {excerpt || t("尚无内容")}
        </p>
      </div>
      {isTrash ? (
        <TrashActions ws={ws} doc={doc} />
      ) : (
        <>
          <div className="whitespace-nowrap pt-1 text-right text-[11.5px] leading-relaxed">
            {/* 只显示末级文件夹名，点它直接进那个文件夹；窄屏放不下就整行让位给下面一行 */}
            <button
              className="hidden cursor-pointer text-[var(--ink-soft)] underline-offset-2 hover:text-[var(--ink)] hover:underline sm:ml-auto sm:block"
              title={displayCatPath(cat, t)}
              onClick={(e) => {
                e.stopPropagation();
                nav.openCategory(cat);
              }}
            >
              {displayCatName(cat.split("/").pop() ?? cat, t)}
            </button>
            <span className="block tabular-nums text-[var(--ink-faint)]">
              {[
                showTime ? formatRelativeTime(at) : "",
                chars > 0 ? t("{n} 字", { n: chars.toLocaleString(), abs: chars }) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <button
            className={`mt-0.5 cursor-pointer self-start rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)] [@media(hover:none)]:visible ${
              menus.docMenu?.id === doc.id ? "visible" : "invisible group-hover:visible"
            }`}
            // 菜单触发器：外部关闭逻辑放它一马，再点一次由这里 toggle 关掉
            data-menu-trigger
            onClick={(e) => menus.toggleDocMenuAt(e, doc.id)}
          >
            <MoreHorizontal size={16} />
          </button>
        </>
      )}
    </div>
  );
}

/** 「最近打开」默认只铺 30 天内的文章；不足这个篇数就按倒序补够，免得久不写作的人看到一片空 */
const RECENT_DAYS = 30;
const RECENT_MIN = 30;

/** 窗口内显示几篇：30 天内的篇数与 30 篇取大。列表已按 timeOf 倒序，取前 n 篇即可 */
function recentCount(docs: DocMeta[], now: number, timeOf: (d: DocMeta) => string): number {
  const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  // 脏时间解析成 NaN，比较恒为 false，自然不计入「30 天内」
  const within = docs.filter((d) => new Date(timeOf(d)).getTime() >= cutoff).length;
  return Math.max(within, RECENT_MIN);
}

/**
 * 时间流视图：左栏宋体大字（日号，或「上周」「九月」这类文字标签），右栏该组的文档。
 * 组之间只用一条细线分隔，越往前粒度越粗，免得一天一篇时整页变成流水账。
 * 「最近打开」入口只铺最近一段，底部按钮一次展开全部；文件夹 / 搜索 / 回收站照旧全量。
 */
export function DocTimeline({ ws }: { ws: Workspace }) {
  const locale = useLocale();
  const t = useT();
  const { nav, timeOf } = ws;
  // 展开状态记住是在哪个视图点的：key 只挂在内层 div，组件本身不随切分类重挂，
  // 所以不能用裸布尔，否则在「最近打开」展开后去别的文件夹再回来还是全量
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === nav.activeCat;
  // 30 天窗口的基准取挂载那一刻：渲染里直接 Date.now() 不纯；一次会话里差几分钟无关紧要
  const [mountedAt] = useState(() => Date.now());
  const windowed = nav.activeCat === ALL && !nav.search.trim() && !nav.isTrash && !expanded;
  const all = ws.filtered;
  const shown = windowed ? all.slice(0, recentCount(all, mountedAt, timeOf)) : all;
  const rest = all.length - shown.length;
  const groups = groupByRecency(shown, undefined, locale, timeOf);

  return (
    // 切换分类时整个列表一次短淡入就够了（key 一换就重挂），行不各自上浮：
    // 这是工作列表不是首页，逐行错开的入场只会让人等
    <div key={nav.activeCat} className="fade-in mt-4">
      {groups.map((group, gi) => (
        <div
          key={group.key}
          className={`grid gap-1.5 pb-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-6 ${
            gi > 0 ? "border-t border-[var(--hairline)] pt-2.5" : ""
          }`}
        >
          {/* 窄屏左栏折成一行横排，大字缩小、标签跟在后面 */}
          <div className="flex items-baseline gap-2 sm:block sm:pt-3">
            <span
              className={`[font-family:var(--serif)] text-[20px] leading-none tracking-tight text-[var(--ink)] ${
                // 文字标签（上周 / 九月）比日号宽得多，收到 20px 免得撑出左栏
                isDayHeading(group.key) ? "sm:text-[30px]" : "sm:text-[20px]"
              }`}
            >
              {group.heading}
            </span>
            {group.sub && (
              <span className="text-[11px] tracking-[.14em] text-[var(--ink-faint)] sm:mt-2 sm:block">
                {group.sub}
              </span>
            )}
          </div>
          <div className="min-w-0">
            {group.docs.map((doc) => (
              <TimelineRow
                key={doc.id}
                ws={ws}
                doc={doc}
                showTime={showsRelativeTime(group.key)}
                at={timeOf(doc)}
              />
            ))}
          </div>
        </div>
      ))}
      {windowed && rest > 0 && (
        <button
          className="mt-6 w-full cursor-pointer rounded-lg py-2.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          onClick={() => setExpandedFor(nav.activeCat)}
        >
          {t("更早的文章 · 还有 {n} 篇", { n: rest })}
        </button>
      )}
    </div>
  );
}
