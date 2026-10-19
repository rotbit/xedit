/**
 * Splitting category paths. Categories are slash paths like `parent/child/grandchild`; top-level categories have no parent.
 * These two functions used to be copied in 6 places (drag, category actions, workspace assembly, picker, tree building, context menu),
 * and once the copies drifted, "sibling" checks gave different answers from different entry points, so they're shared here.
 */
import type { TFn } from "@/i18n/t";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { TEMPLATE_CATEGORY } from "@/lib/templates";

/** Parent path; top-level categories return an empty string (which is also the key for the "top level" drop target) */
export const parentOf = (path: string): string =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/** Last segment name (for display); for a top-level category it's the whole thing */
export const nameOf = (path: string): string =>
  path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

/**
 * Displaying category names: 「未分类」 and 「模板」 are reserved names written into data and matched literally, so they're always stored in Chinese
 * and only translated for display. User-created category names are shown as-is — the whole string can't be passed to t(),
 * or a category that happens to be named something like 「删除」 would get translated by the dictionary.
 */
const RESERVED_CATS = new Set<string>([UNCATEGORIZED, TEMPLATE_CATEGORY]);

export const displayCatName = (name: string, t: TFn): string =>
  RESERVED_CATS.has(name) ? t(name) : name;

/** Display a whole path segment by segment (「模板/周报」→ "Templates/周报") */
export const displayCatPath = (path: string, t: TFn): string =>
  path
    .split("/")
    .map((seg) => displayCatName(seg, t))
    .join("/");
