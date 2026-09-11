"use client";

/**
 * 侧栏手动排序的数据形状与读写。
 * items：父路径（顶级为空串）→ 该父级下「子分类 + 直属文章」的混排键序列，
 *        子分类记 `c:<名称>`、文章记 `d:<文档id>`。分类用名称而非全路径，
 *        父级改名/迁移时子级顺序自动跟随，不需要重写。这是当前唯一写入的字段。
 * cats/docs：老版本的两份独立序列（分类名列表 / 文档 id 列表），只读不再写。
 *        某个父级有 items 记录就按 items 混排；没有则退回老规则——先分类后文章，
 *        分类按 cats 排、文章按 docs 排。
 * 未出现在序列里的项排在已排序项之后，维持原有次序（分类按拼音、文章按更新时间）。
 * 本地永远落 localStorage（秒开 + 离线可用），登录态再异步推给服务端跨设备同步。
 */

export interface SidebarOrder {
  items: Record<string, string[]>;
  /** @deprecated 老数据回退，只读 */
  cats: Record<string, string[]>;
  /** @deprecated 老数据回退，只读 */
  docs: Record<string, string[]>;
}

/** 混排序列里的子分类键（用名称，跟随父级改名） */
export const catKey = (name: string) => `c:${name}`;

/** 混排序列里的文章键 */
export const docKey = (id: string) => `d:${id}`;

export const EMPTY_ORDER: SidebarOrder = { items: {}, cats: {}, docs: {} };

const KEY = "xedit-sidebar-order";

export function parseSidebarOrder(raw: unknown): SidebarOrder {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return EMPTY_ORDER;
    const pickMap = (v: unknown): Record<string, string[]> => {
      if (!v || typeof v !== "object") return {};
      const out: Record<string, string[]> = {};
      for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(list)) {
          out[k] = list.filter((s): s is string => typeof s === "string");
        }
      }
      return out;
    };
    const o = obj as { items?: unknown; cats?: unknown; docs?: unknown };
    return { items: pickMap(o.items), cats: pickMap(o.cats), docs: pickMap(o.docs) };
  } catch {
    return EMPTY_ORDER;
  }
}

export function readLocalOrder(): SidebarOrder {
  if (typeof window === "undefined") return EMPTY_ORDER;
  return parseSidebarOrder(localStorage.getItem(KEY));
}

export function writeLocalOrder(order: SidebarOrder): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // 存储满时放弃本地缓存，服务端仍然有份
  }
}

/** 按显示序列生成新的排序列表：把 moved 挪到 target 的前/后 */
export function reorderList(
  displayed: string[],
  moved: string,
  target: string,
  zone: "before" | "after"
): string[] {
  const list = displayed.filter((x) => x !== moved);
  const at = list.indexOf(target);
  if (at < 0) return displayed;
  list.splice(zone === "before" ? at : at + 1, 0, moved);
  return list;
}
