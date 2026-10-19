"use client";

/**
 * Data shape and read/write for manual sidebar ordering.
 * items: parent path (empty for top level) → the interleaved key sequence of "subcategories + direct docs" under that parent,
 *        with subcategories as `c:<name>` and docs as `d:<docId>`. Categories use the name rather than the full path,
 *        so child order follows automatically when a parent is renamed/moved, without rewriting. This is the only field written now.
 * cats/docs: the two separate sequences from older versions (category name list / doc id list), read-only, no longer written.
 *        A parent with an items record is interleaved by items; otherwise fall back to the old rule — categories first, then docs,
 *        categories ordered by cats and docs by docs.
 * Items not in the sequence come after the ordered ones, keeping their original order (categories by pinyin, docs by update time).
 * Always stored locally in localStorage (instant load + offline), and when logged in pushed asynchronously to the server for cross-device sync.
 */

export interface SidebarOrder {
  items: Record<string, string[]>;
  /** @deprecated Fallback for old data, read-only */
  cats: Record<string, string[]>;
  /** @deprecated Fallback for old data, read-only */
  docs: Record<string, string[]>;
}

/** Subcategory key in the interleaved sequence (by name, follows parent renames) */
export const catKey = (name: string) => `c:${name}`;

/** Doc key in the interleaved sequence */
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
    // When storage is full, give up the local cache; the server still has a copy
  }
}

/** Build a new ordered list from the display sequence: move `moved` before/after `target` */
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
