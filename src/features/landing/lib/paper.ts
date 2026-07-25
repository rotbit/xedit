/**
 * 主题样张的 class 约定。刻意不 import 主题 CSS，
 * 好让客户端组件只拿到几十字节的类名规则，17KB 的主题表留在服务端。
 */

export const PAPER_CLASS = "xe-paper";

/** 某套主题对应的样张 class */
export function themeClass(id: string): string {
  return `${PAPER_CLASS} xe-t-${id}`;
}

/** 主题元信息（不含 CSS），可安全传给客户端组件 */
export interface ThemeMeta {
  id: string;
  name: string;
  color: string;
  tag: string;
}
