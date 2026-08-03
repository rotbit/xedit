"use client";

/**
 * 侧栏手动排序的数据形状与读写。
 * cats：父路径（顶级为空串）→ 子分类「名称」列表；用名称而非全路径，
 *       父级改名/迁移时子级顺序自动跟随，不需要重写。
 * docs：分类路径 → 文档 id 列表。
 * 未出现在列表里的项排在已排序项之后，维持原有次序（分类按拼音、文章按更新时间）。
 * 本地永远落 localStorage（秒开 + 离线可用），登录态再异步推给服务端跨设备同步。
 */

export interface SidebarOrder {
  cats: Record<string, string[]>;
  docs: Record<string, string[]>;
}

export const EMPTY_ORDER: SidebarOrder = { cats: {}, docs: {} };

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
    const o = obj as { cats?: unknown; docs?: unknown };
    return { cats: pickMap(o.cats), docs: pickMap(o.docs) };
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
