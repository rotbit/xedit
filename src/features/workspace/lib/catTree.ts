import { UNCATEGORIZED } from "../constants";
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

/** 由「父/子」路径构建分类树 */
export function buildTree(docs: DocMeta[], customCats: string[]): CatNode[] {
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

  const fill = (n: CatNode): number => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    n.count = n.docs.length + n.children.reduce((s, c) => s + fill(c), 0);
    return n.count;
  };
  roots.forEach(fill);
  roots.sort((a, b) => {
    if (a.path === UNCATEGORIZED) return 1;
    if (b.path === UNCATEGORIZED) return -1;
    return a.name.localeCompare(b.name, "zh");
  });
  return roots;
}
