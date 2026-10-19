"use client";

import { ALL, DROP_HL } from "../constants";
import { CategoryRow } from "./CategoryRow";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * Category tree: categories are laid out flush with no 「最近打开」 (Recent) root row (like Obsidian's file tree).
 * An empty area below the tree serves as the root-level drop target: dropping a category promotes it to top level, dropping a document moves it to uncategorized,
 * and right-clicking it opens the root menu (new document / new folder / refresh / import).
 */
export function CategoryTree({ ws }: { ws: Workspace }) {
  const { menus, drag, tree } = ws;
  const rootDrop = drag.dropSpot?.kind === "cat" && drag.dropSpot.key === ALL;

  return (
    <nav className="mt-0 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
      {tree.map((n) => (
        <CategoryRow key={n.path} ws={ws} node={n} depth={0} />
      ))}
      {/* Fill the remaining height so even a short tree has a root-level blank area for drag-and-drop and right-click */}
      <div
        className={`min-h-10 flex-1 rounded-md ${rootDrop ? DROP_HL : ""}`}
        {...drag.dropProps(ALL)}
        onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
      />
    </nav>
  );
}
