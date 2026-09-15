"use client";

import { ChevronRight, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import {
  DROP_HL,
  DROP_LINE_BOTTOM,
  DROP_LINE_TOP,
  UNCATEGORIZED,
  rowCls,
  rowInset,
  treeIndent,
} from "../constants";
import { DocRow } from "./DocRow";
import type { CatNode } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

const actionBtn =
  "cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)]";

/**
 * 子项容器：相对定位给引导线当锚；isolate 开一个独立层叠上下文，
 * 让引导线能用负 z-index 压到行的悬停/选中底色下面，又不至于沉到侧栏背景之后。
 * tree-branch 类名供引导线的悬停规则回查。
 */
export const treeBranchCls = "tree-branch relative isolate";

/**
 * 缩进引导线（Obsidian 文件树同款）：从父分类的折叠箭头正下方垂到子项末尾。
 * 平时是一道淡线；鼠标停进某个分支，只有「最内层被悬停的那个分支」的线加深，
 * 看到的始终是「光标所在这一组属于谁」。行的底色从缩进处才开始（见 rowInset），
 * 线永远露在高亮左侧，不会被盖住。
 * 横向落点 = 父行的箭头中心 = 16 + treeIndent(depth)。
 */
export function TreeGuide({ depth }: { depth: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-1 top-0 -z-10 w-px bg-[var(--hairline)] transition-colors [.tree-branch:hover:not(:has(.tree-branch:hover))>&]:bg-[var(--hairline-strong)]"
      style={{ left: `${16 + treeIndent(depth)}px` }}
    />
  );
}

/** 侧栏分类行；展开时按 node.items 递归渲染子分类与直属文章（两者可混排） */
export function CategoryRow({
  ws,
  node,
  depth,
}: {
  ws: Workspace;
  node: CatNode;
  depth: number;
}) {
  const { nav, prefs, menus, drag } = ws;
  const isOpen = prefs.expanded.has(node.path);
  const active = nav.activeCat === node.path && !nav.readingId;
  const hasChildren = node.children.length > 0 || node.docs.length > 0;
  const canManage = node.path !== UNCATEGORIZED;
  const spot = drag.dropSpot;
  const zone = spot?.kind === "cat" && spot.key === node.path ? spot.zone : null;
  const dropCls =
    zone === "into" ? DROP_HL : zone === "before" ? DROP_LINE_TOP : zone === "after" ? DROP_LINE_BOTTOM : "";

  return (
    <div>
      <div
        className="group/cat relative"
        {...(canManage ? drag.dragSrcProps({ kind: "cat", path: node.path }) : {})}
        {...drag.dropProps(node.path)}
      >
        <div
          className={`flex cursor-pointer items-center gap-1 rounded-md py-1.5 pl-px pr-2 text-left text-[13px] transition-colors ${rowCls(active)} ${dropCls} ${
            drag.isDragging({ kind: "cat", path: node.path }) ? "opacity-40" : ""
          }`}
          // 缩进用外边距而不是内边距：底色从这里起，父级引导线露在左侧；箭头盒子紧贴行左缘。
          // 顶层行没有父级引导线要避让（rowInset(0) === 0），底色顶格铺满；
          // 单独补 6px 内边距把箭头中心顶到 16px，正对自己子分支的引导线（left = 16 + treeIndent(0)）
          style={{
            marginLeft: `${rowInset(depth)}px`,
            width: `calc(100% - ${rowInset(depth)}px)`,
            ...(depth === 0 ? { paddingLeft: "6px" } : null),
          }}
          onClick={() => nav.openCategory(node.path)}
          onContextMenu={(e) => menus.openCatMenuAt(e, node.path)}
          title={node.name}
        >
          <span
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] hover:bg-[var(--hairline)]"
            onClick={(e) => {
              e.stopPropagation();
              prefs.toggleExpand(node.path);
            }}
          >
            {hasChildren ? (
              <ChevronRight
                size={12}
                className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
            ) : null}
          </span>
          <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
            {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          {/* 不显示篇数：目录树只管导航，总数在顶部统计行，数字挂在每行右侧只是噪音 */}
          <span className="ml-1 min-w-0 flex-1 truncate">{node.name}</span>
        </div>
        {/* 新建文章/子文件夹都收进「⋯」菜单：悬停快捷图标会压住长标题 */}
        {canManage ? (
          <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
            <button
              className={`${actionBtn} hover:text-[var(--ink)]`}
              // 标记成菜单触发器：菜单的外部关闭逻辑放它一马，再点一次由这里 toggle 关掉
              data-menu-trigger
              title="管理文件夹"
              onClick={(e) => menus.toggleCatMenuAt(e, node.path)}
            >
              <MoreHorizontal size={13} />
            </button>
          </span>
        ) : null}
      </div>
      {isOpen ? (
        <div className={treeBranchCls}>
          <TreeGuide depth={depth} />
          {node.items.map((it) =>
            it.kind === "cat" ? (
              <CategoryRow key={it.node.path} ws={ws} node={it.node} depth={depth + 1} />
            ) : (
              <DocRow key={it.doc.id} ws={ws} doc={it.doc} depth={depth + 1} />
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
