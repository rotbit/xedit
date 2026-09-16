/**
 * 分类路径的拆解。分类以 `父/子/孙` 的斜杠路径表示，顶级分类没有父级。
 * 这两个函数原先在 6 处各抄一份（拖拽、分类操作、工作台汇总、选择器、树构建、右键菜单），
 * 抄本之间一旦走偏，「同级」的判断就会在不同入口给出不同答案，所以收到这里共用。
 */

/** 父级路径；顶级分类返回空串（空串同时是「顶级」这个落点的键） */
export const parentOf = (path: string): string =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/** 末级名称（显示用），顶级分类就是它自己 */
export const nameOf = (path: string): string =>
  path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
