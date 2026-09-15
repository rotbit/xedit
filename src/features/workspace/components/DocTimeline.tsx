"use client";

import { MoreHorizontal } from "lucide-react";
import { UNCATEGORIZED } from "../constants";
import { groupByDay } from "../lib/dayGroups";
import { formatTime } from "../lib/docSource";
import { DocContextMenu } from "./DocContextMenu";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 入场动画的最大延迟，避免长列表末尾等待过久 */
const MAX_STAGGER_MS = 320;

/** 列表摘要是服务端粗剥的纯文本，里面常剩整条长链接，行上只显示域名，别让 URL 把版面撑乱 */
function cleanExcerpt(s: string): string {
  return s
    .replace(/https?:\/\/([^\s/?#]+)[^\s]*/g, (_, host: string) => {
      const parts = host.replace(/^www\./, "").split(".");
      return `‹${parts.slice(-2).join(".")}›`;
    })
    .replace(/\\_/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/** 回收站行右侧的恢复 / 彻底删除：行布局里不再需要分隔线，压成一排贴边小按钮 */
function TrashActions({ ws, doc }: { ws: Workspace; doc: DocMeta }) {
  const { docActions } = ws;
  return (
    <div className="flex shrink-0 gap-1.5 pt-0.5">
      <button
        className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-2 py-0.5 text-[11.5px] text-[var(--ink)] hover:bg-[var(--paper)]"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.restoreDoc(doc);
        }}
      >
        恢复
      </button>
      <button
        className="cursor-pointer rounded-md px-2 py-0.5 text-[11.5px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.hardDeleteDoc(doc);
        }}
      >
        彻底删除
      </button>
    </div>
  );
}

/** 时间流里的一篇：左边标题 + 单行摘要，右边浅字分类与时间，无边框只靠留白分隔 */
function DocRow({ ws, doc, index }: { ws: Workspace; doc: DocMeta; index: number }) {
  const { nav, menus, drag } = ws;
  const { isTrash } = nav;
  const cat = doc.category || UNCATEGORIZED;
  const excerpt = cleanExcerpt(doc.excerpt || "");
  const chars = typeof doc.chars === "number" ? doc.chars : 0;
  // 回收站行右侧只有两个按钮，少一条空的轨道，免得白白多出一份 gap
  const cols = isTrash
    ? "grid-cols-[minmax(0,1fr)_auto]"
    : "grid-cols-[minmax(0,1fr)_auto_auto]";
  return (
    <div
      className={`rise group relative -mx-3 grid ${cols} items-start gap-5 rounded-lg px-3 py-3.5 transition-colors duration-150 hover:bg-[var(--accent-wash)] ${
        isTrash ? "" : "cursor-pointer"
      } ${drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""}`}
      style={{ animationDelay: `${Math.min(index * 40, MAX_STAGGER_MS)}ms` }}
      onClick={() => {
        // 回收站里的行点不开：那里只有恢复 / 彻底删除两个按钮
        if (!isTrash) nav.openDoc(doc.id);
      }}
      onContextMenu={isTrash ? undefined : (e) => menus.openDocMenuAt(e, doc.id)}
      {...(isTrash ? {} : drag.dragSrcProps({ kind: "doc", id: doc.id }))}
    >
      <div className="min-w-0">
        <p className="truncate text-[15.5px] font-semibold leading-[1.4] text-[var(--ink)]">
          {doc.title || "未命名文章"}
        </p>
        <p
          className={`mt-0.5 truncate text-[13px] ${
            excerpt ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"
          }`}
        >
          {excerpt || "尚无内容"}
        </p>
      </div>
      {isTrash ? (
        <TrashActions ws={ws} doc={doc} />
      ) : (
        <>
          <div className="whitespace-nowrap pt-1 text-right text-[11.5px] leading-relaxed">
            {/* 只显示末级分类名；窄屏放不下就整行让位给时间 */}
            <span className="hidden text-[var(--ink-soft)] sm:block" title={cat}>
              {cat.split("/").pop()}
            </span>
            <span className="block tabular-nums text-[var(--ink-faint)]">
              {formatTime(doc.updatedAt)}
              {chars > 0 ? ` · ${chars.toLocaleString()} 字` : ""}
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
            <MoreHorizontal size={15} />
          </button>
        </>
      )}
      <DocContextMenu ws={ws} doc={doc} cat={cat} />
    </div>
  );
}

/**
 * 时间流视图：左栏宋体大号日号，右栏当天的文档。组之间只用一条细线分隔，
 * 日期本身充当版面的装饰，比等高卡片网格更安静也更省纵向空间。
 */
export function DocTimeline({ ws }: { ws: Workspace }) {
  const groups = groupByDay(ws.filtered);
  // 入场 stagger 按整个列表连续计数，跨组也保持自上而下的节奏：先算出每组的起始序号
  const offsets: number[] = [];
  for (let i = 0, acc = 0; i < groups.length; i++) {
    offsets.push(acc);
    acc += groups[i].docs.length;
  }

  return (
    <div className="mt-4">
      {groups.map((group, gi) => (
        <div
          key={group.key}
          className={`grid gap-1.5 pb-[22px] sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-6 ${
            gi > 0 ? "border-t border-[var(--hairline)] pt-[10px]" : ""
          }`}
        >
          {/* 窄屏左栏折成一行横排，日号缩小、标签跟在后面 */}
          <div className="flex items-baseline gap-2 sm:block sm:pt-3">
            <span className="[font-family:var(--serif)] text-[20px] leading-none tracking-tight text-[var(--ink)] sm:text-[30px]">
              {group.dayNum}
            </span>
            <span className="text-[11px] tracking-[.14em] text-[var(--ink-faint)] sm:mt-2 sm:block">
              {group.label}
            </span>
          </div>
          <div className="min-w-0">
            {group.docs.map((doc, i) => (
              <DocRow key={doc.id} ws={ws} doc={doc} index={offsets[gi] + i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
