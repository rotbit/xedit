import { MAX_DEPTH, UNCATEGORIZED } from "../constants";
import { nameOf, parentOf } from "./catPath";
import { EMPTY_ORDER, catKey, docKey, type SidebarOrder } from "./sidebarOrder";
import type { CatItem, CatNode, DocMeta } from "../types";

/** Collator for Chinese sorting: localeCompare rebuilds a collator on every comparison, so hoist one to module level for reuse */
const zhCollator = new Intl.Collator("zh");

/** All existing category paths (used by docs ∪ custom), deduped and sorted in Chinese order */
export function allCategories(customCats: string[], docs: DocMeta[] | null): string[] {
  return Array.from(
    new Set([...customCats, ...(docs ?? []).map((d) => d.category || UNCATEGORIZED)])
  ).sort((a, b) => zhCollator.compare(a, b));
}

/** Find a node in the tree by path (reorder drops need the display sequence under a given parent) */
export function findNode(roots: CatNode[], path: string): CatNode | null {
  for (const r of roots) {
    if (r.path === path) return r;
    if (path.startsWith(`${r.path}/`)) return findNode(r.children, path);
  }
  return null;
}

/** Whether category path (with its subtree) can be placed under parent (empty = top level): shared by drag and "Move to folder".
 *  The hard limit is the 100-char category field — if the longest path in the moved subtree exceeds it, the server truncates and merges wrongly;
 *  the depth cap only guards against runaway nesting. */
export function canNestCategory(path: string, parent: string, all: string[]): boolean {
  if (path === UNCATEGORIZED || parent === UNCATEGORIZED) return false;
  if (parent === path || parent.startsWith(`${path}/`)) return false; // Can't be placed into itself or a descendant
  if (parent === parentOf(path)) return false;
  const subtree = all.filter((c) => c === path || c.startsWith(`${path}/`));
  const name = nameOf(path);
  const toPath = parent ? `${parent}/${name}` : name;
  const longest = subtree.reduce((m, c) => Math.max(m, c.length), path.length);
  if (longest - path.length + toPath.length > 100) return false;
  const height = subtree.reduce(
    (h, c) => Math.max(h, c.split("/").length - path.split("/").length + 1),
    1
  );
  return (parent ? parent.split("/").length : 0) + height <= MAX_DEPTH;
}

/** Build the category tree from `parent/child` paths; order is the sidebar's manual ordering —
 *  manually ordered items come first (in list order), unordered ones follow under the default rules.
 *  Each node's items is the interleaved display sequence of subcategories and direct docs (rendering follows it). */
export function buildTree(
  docs: DocMeta[],
  customCats: string[],
  order: SidebarOrder = EMPTY_ORDER
): CatNode[] {
  const roots: CatNode[] = [];
  const nodeMap = new Map<string, CatNode>();

  const ensure = (path: string): CatNode => {
    const existing = nodeMap.get(path);
    if (existing) return existing;
    const node: CatNode = { name: nameOf(path), path, children: [], docs: [], items: [], count: 0 };
    nodeMap.set(path, node);
    const parent = parentOf(path);
    if (parent) ensure(parent).children.push(node);
    else roots.push(node);
    return node;
  };

  for (const c of customCats) ensure(c);
  for (const d of docs) ensure(d.category || UNCATEGORIZED).docs.push(d);

  /** Manually ordered indexes first, unordered after; the unordered part uses the fallback comparator */
  const bySavedOrder = <T,>(
    list: T[],
    saved: string[] | undefined,
    keyOf: (x: T) => string,
    fallback: (a: T, b: T) => number
  ) => {
    const rank = new Map((saved ?? []).map((k, i) => [k, i]));
    list.sort((a, b) => {
      const ra = rank.get(keyOf(a)) ?? Infinity;
      const rb = rank.get(keyOf(b)) ?? Infinity;
      if (ra !== rb) return ra - rb;
      return ra === Infinity ? fallback(a, b) : 0;
    });
  };

  /** Keys in the interleaved sequence: subcategories by name, docs by id */
  const itemKey = (it: CatItem) =>
    it.kind === "cat" ? catKey(it.node.name) : docKey(it.doc.id);

  const fill = (n: CatNode): number => {
    bySavedOrder(n.children, order.cats[n.path], (c) => c.name, (a, b) =>
      a.name.localeCompare(b.name, "zh")
    );
    // Default doc order = the input list's order (updated time descending), unchanged when not manually ordered
    bySavedOrder(n.docs, order.docs[n.path], (d) => d.id, () => 0);
    // The old rule "categories first, then docs" is the fallback base order, then re-sort by the interleaved sequence:
    // recorded items follow their record, unrecorded ones follow after in base order
    n.items = [
      ...n.children.map((node): CatItem => ({ kind: "cat", node })),
      ...n.docs.map((doc): CatItem => ({ kind: "doc", doc })),
    ];
    bySavedOrder(n.items, order.items[n.path], itemKey, () => 0);
    n.count = n.docs.length + n.children.reduce((s, c) => s + fill(c), 0);
    return n.count;
  };

  bySavedOrder(roots, order.cats[""], (c) => c.name, (a, b) => {
    if (a.path === UNCATEGORIZED) return 1;
    if (b.path === UNCATEGORIZED) return -1;
    return a.name.localeCompare(b.name, "zh");
  });
  // The top level has only categories and no direct docs, but still goes through the items sequence (same records as child levels)
  bySavedOrder(roots, order.items[""], (c) => catKey(c.name), () => 0);
  roots.forEach(fill);
  return roots;
}
