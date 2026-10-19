"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import {
  DROP_HL,
  DROP_LINE_BOTTOM,
  DROP_LINE_TOP,
  UNCATEGORIZED,
  rowCls,
  rowInset,
  rowPadLeft,
  treeIndent,
} from "../constants";
import { useT } from "@/i18n/useT";
import { displayCatName } from "../lib/catPath";
import { DocRow } from "./DocRow";
import { iconTone } from "./NavRow";
import type { CatNode } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

const actionBtn =
  "cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)]";

/**
 * Children container: relatively positioned as the anchor for guide lines; isolate opens its own stacking context
 * so guide lines can use a negative z-index to sit under the row's hover/selected background without sinking behind the sidebar background.
 * The tree-branch class name lets the guide line's hover rules look it up.
 */
export const treeBranchCls = "tree-branch relative isolate";

/**
 * Indent guide line (like Obsidian's file tree): drops from directly below the parent category's icon slot to the end of its children.
 * Normally a faint line; when the mouse rests in a branch, only the line of the innermost hovered branch darkens,
 * so you always see "who this group under the cursor belongs to". Row backgrounds start at the indent (see rowInset),
 * so the line always shows to the left of the highlight and is never covered.
 * Horizontal position = center of the parent row's icon slot = 15 + treeIndent(depth) (derivation in rowPadLeft in constants).
 */
export function TreeGuide({ depth }: { depth: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-1 top-0 -z-10 w-px bg-[var(--hairline)] transition-colors [.tree-branch:hover:not(:has(.tree-branch:hover))>&]:bg-[var(--hairline-strong)]"
      style={{ left: `${15 + treeIndent(depth)}px` }}
    />
  );
}

/** Sidebar category row; when expanded, recursively renders child categories and direct documents from node.items (the two can be interleaved) */
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
  const t = useT();
  const name = displayCatName(node.name, t);
  const isOpen = prefs.expanded.has(node.path);
  const active = nav.activeCat === node.path && !nav.readingId;
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
          className={`flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${rowCls(active)} ${dropCls} ${
            drag.isDragging({ kind: "cat", path: node.path }) ? "opacity-40" : ""
          }`}
          // Indent with margin rather than padding: the background starts here and the parent guide line shows on the left. The padding puts the icon slot center at 15 + treeIndent(depth)
          style={{
            marginLeft: `${rowInset(depth)}px`,
            width: `calc(100% - ${rowInset(depth)}px)`,
            paddingLeft: `${rowPadLeft(depth)}px`,
          }}
          // Clicking a folder only expands / collapses it in the sidebar (like Obsidian): whatever is being read on the right stays put.
          // To see this folder's timeline on the right, use the 「···」 menu or the breadcrumbs
          onClick={() => prefs.toggleExpand(node.path)}
          onContextMenu={(e) => menus.openCatMenuAt(e, node.path)}
          title={name}
        >
          {/* 14px icon slot: an always-visible chevron (like Obsidian), right when collapsed and down when expanded; the whole row toggles expand / collapse */}
          <span className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center ${iconTone(active)}`}>
            <ChevronRight size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </span>
          {/* No item count: the tree is just for navigation, and numbers on every row are noise */}
          <span className="min-w-0 flex-1 truncate">{name}</span>
        </div>
        {/* New document/subfolder both live in the 「⋯」 menu: hover shortcut icons would cover long titles */}
        {canManage ? (
          <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
            <button
              className={`${actionBtn} hover:text-[var(--ink)]`}
              // Marked as a menu trigger: the menu's outside-click logic spares it, so clicking again toggles it closed here
              data-menu-trigger
              title={t("管理文件夹")}
              onClick={(e) => menus.toggleCatMenuAt(e, node.path)}
            >
              <MoreHorizontal size={14} />
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
