/**
 * 分类路径的拆解。分类以 `父/子/孙` 的斜杠路径表示，顶级分类没有父级。
 * 这两个函数原先在 6 处各抄一份（拖拽、分类操作、工作台汇总、选择器、树构建、右键菜单），
 * 抄本之间一旦走偏，「同级」的判断就会在不同入口给出不同答案，所以收到这里共用。
 */
import type { TFn } from "@/i18n/t";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { TEMPLATE_CATEGORY } from "@/lib/templates";

/** 父级路径；顶级分类返回空串（空串同时是「顶级」这个落点的键） */
export const parentOf = (path: string): string =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/** 末级名称（显示用），顶级分类就是它自己 */
export const nameOf = (path: string): string =>
  path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

/**
 * 分类名的显示：「未分类」「模板」是写进数据、靠字面匹配的保留名，存储一律保持中文，
 * 只在显示时翻译。用户自建的分类名原样显示——不能整串丢给 t()，
 * 否则恰好叫「删除」之类的分类会被字典翻掉。
 */
const RESERVED_CATS = new Set<string>([UNCATEGORIZED, TEMPLATE_CATEGORY]);

export const displayCatName = (name: string, t: TFn): string =>
  RESERVED_CATS.has(name) ? t(name) : name;

/** 整条路径逐段显示（「模板/周报」→ "Templates/周报"） */
export const displayCatPath = (path: string, t: TFn): string =>
  path
    .split("/")
    .map((seg) => displayCatName(seg, t))
    .join("/");
