/**
 * 点开一个 `#标签` 的请求。编辑器与预览都只是渲染层，不认识文库，
 * 于是用一条自定义事件把「按标签筛文章」的活交给应用层（侧栏接住，见 Sidebar.tsx）。
 * 模式与 [[双向链接]] 的 WIKI_OPEN_EVENT 一致。
 */

export const TAG_OPEN_EVENT = "xedit:open-tag";

export function requestOpenTag(tag: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TAG_OPEN_EVENT, { detail: { tag } }));
}
