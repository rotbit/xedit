import { MAX_DEPTH, UNCATEGORIZED } from "../constants";
import { nameOf, parentOf } from "./catPath";
import { EMPTY_ORDER, catKey, docKey, type SidebarOrder } from "./sidebarOrder";
import type { CatItem, CatNode, DocMeta } from "../types";

/** 中文排序用的 collator：localeCompare 每次比较都要重建排序器，提到模块级复用 */
const zhCollator = new Intl.Collator("zh");

/** 现存的全部分类路径（文章已用 ∪ 自建），按中文排序去重 */
export function allCategories(customCats: string[], docs: DocMeta[] | null): string[] {
  return Array.from(
    new Set([...customCats, ...(docs ?? []).map((d) => d.category || UNCATEGORIZED)])
  ).sort((a, b) => zhCollator.compare(a, b));
}

/** 按路径在树里找节点（排序落点需要拿到某父级下的显示序列） */
export function findNode(roots: CatNode[], path: string): CatNode | null {
  for (const r of roots) {
    if (r.path === path) return r;
    if (path.startsWith(`${r.path}/`)) return findNode(r.children, path);
  }
  return null;
}

/** 分类 path（连同子树）能否挂到 parent 下（空串 = 顶级）：拖拽与「移动到文件夹」共用。
 *  硬约束是分类字段 100 字符——迁移后子树里最长路径超限会被服务端截断错并；
 *  层级上限只防失控。 */
export function canNestCategory(path: string, parent: string, all: string[]): boolean {
  if (path === UNCATEGORIZED || parent === UNCATEGORIZED) return false;
  if (parent === path || parent.startsWith(`${path}/`)) return false; // 不能挂进自己或子孙
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

/** 由「父/子」路径构建分类树；order 是侧栏手动排序——
 *  已手排的排前面（按列表次序），没排过的跟在后面维持默认规则。
 *  每个节点的 items 是子分类与直属文章的混排显示序列（渲染按它走）。 */
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

  /** 手排索引在前、未排在后；未排部分用 fallback 比较 */
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

  /** 混排序列里的键：子分类用名称、文章用 id */
  const itemKey = (it: CatItem) =>
    it.kind === "cat" ? catKey(it.node.name) : docKey(it.doc.id);

  const fill = (n: CatNode): number => {
    bySavedOrder(n.children, order.cats[n.path], (c) => c.name, (a, b) =>
      a.name.localeCompare(b.name, "zh")
    );
    // 文章默认次序 = 传入列表序（更新时间倒序），未手排时保持不变
    bySavedOrder(n.docs, order.docs[n.path], (d) => d.id, () => 0);
    // 老规则「分类在前、文章在后」作为回退底序，再按混排序列重排：
    // items 里记过的按记录走，没记过的跟在后面保持底序
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
  // 顶级只有分类没有直属文章，但仍走 items 序列（与子级同一套记录）
  bySavedOrder(roots, order.items[""], (c) => catKey(c.name), () => 0);
  roots.forEach(fill);
  return roots;
}
