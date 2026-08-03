"use client";

import { ChevronRight, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { DROP_HL, UNCATEGORIZED, countCls, rowCls, treeIndent } from "../constants";
import { DocRow } from "./DocRow";
import type { CatNode } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

const actionBtn =
  "cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)]";

/** 侧栏分类行；展开时递归渲染子分类与直属文章 */
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

  return (
    <div>
      <div
        className="group/cat relative"
        {...(canManage ? drag.dragSrcProps({ kind: "cat", path: node.path }) : {})}
        {...drag.dropProps(node.path)}
      >
        <div
          className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${rowCls(active)} ${
            drag.dropTarget === node.path ? DROP_HL : ""
          } ${drag.isDragging({ kind: "cat", path: node.path }) ? "opacity-40" : ""}`}
          style={{ paddingLeft: `${6 + treeIndent(depth)}px` }}
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
          <span className="ml-1 min-w-0 flex-1 truncate">{node.name}</span>
          <span className={`rounded-full px-1.5 text-[11px] group-hover/cat:hidden ${countCls(active)}`}>
            {node.count}
          </span>
        </div>
        {/* 新建文章/子分类都收进「⋯」菜单：悬停快捷图标会压住长标题 */}
        {canManage ? (
          <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
            <button
              className={`${actionBtn} hover:text-[var(--ink)]`}
              title="管理分类"
              onClick={(e) => menus.toggleCatMenuAt(e, node.path)}
            >
              <MoreHorizontal size={13} />
            </button>
          </span>
        ) : null}
      </div>
      {isOpen ? (
        <div>
          {node.children.map((c) => (
            <CategoryRow key={c.path} ws={ws} node={c} depth={depth + 1} />
          ))}
          {node.docs.map((d) => (
            <DocRow key={d.id} ws={ws} doc={d} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
