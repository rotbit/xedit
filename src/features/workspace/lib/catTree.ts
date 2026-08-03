import { MAX_DEPTH, UNCATEGORIZED } from "../constants";
import { EMPTY_ORDER, type SidebarOrder } from "./sidebarOrder";
import type { CatNode, DocMeta } from "../types";

/** 分类圆点色：顶级分类名哈希到固定色板（与写作足迹同源），子分类跟随父级；未分类恒为中性灰 */
export function catColorOf(cat: string): string {
  if (cat === UNCATEGORIZED) return "var(--hairline-strong)";
  const root = cat.split("/")[0];
  let h = 0;
  for (let i = 0; i < root.length; i++) h = (h * 31 + root.charCodeAt(i)) >>> 0;
  return `var(--cat-${(h % 6) + 1})`;
}

/** 现存的全部分类路径（文章已用 ∪ 自建），按中文排序去重 */
export function allCategories(customCats: string[], docs: DocMeta[] | null): string[] {
  return Array.from(
    new Set([...customCats, ...(docs ?? []).map((d) => d.category || UNCATEGORIZED)])
  ).sort((a, b) => a.localeCompare(b, "zh"));
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
  const curParent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (parent === curParent) return false;
  const subtree = all.filter((c) => c === path || c.startsWith(`${path}/`));
  const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
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
 *  已手排的排前面（按列表次序），没排过的跟在后面维持默认规则 */
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
    const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    const node: CatNode = { name, path, children: [], docs: [], count: 0 };
    nodeMap.set(path, node);
    if (path.includes("/")) {
      ensure(path.slice(0, path.lastIndexOf("/"))).children.push(node);
    } else {
      roots.push(node);
    }
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

  const fill = (n: CatNode): number => {
    bySavedOrder(n.children, order.cats[n.path], (c) => c.name, (a, b) =>
      a.name.localeCompare(b.name, "zh")
    );
    // 文章默认次序 = 传入列表序（更新时间倒序），未手排时保持不变
    bySavedOrder(n.docs, order.docs[n.path], (d) => d.id, () => 0);
    n.count = n.docs.length + n.children.reduce((s, c) => s + fill(c), 0);
    return n.count;
  };

  bySavedOrder(roots, order.cats[""], (c) => c.name, (a, b) => {
    if (a.path === UNCATEGORIZED) return 1;
    if (b.path === UNCATEGORIZED) return -1;
    return a.name.localeCompare(b.name, "zh");
  });
  roots.forEach(fill);
  return roots;
}
