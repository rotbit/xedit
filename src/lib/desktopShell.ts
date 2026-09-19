/**
 * xEdit 桌面壳（Electron）通过 preload 挂在 window 上的那点东西。
 * 同一个站点既跑在普通浏览器里、又跑在桌面壳里，只有壳里才有 window.xeditDesktop，
 * 「只在桌面版露出」的功能据此判断。类型写在这一处，各调用方不再各自 as 一遍。
 * 注意 app/layout.tsx 里那段首帧内联脚本是字符串，导入不了这里，它自己判一次 platform。
 */

/** preload（xedit-desktop/preload.js）暴露的接口 */
export interface XeditDesktop {
  /** process.platform，"darwin" 时顶栏要给红绿灯留位 */
  platform?: string;
  /** 桌面壳顶栏自己会显示草稿进度胶囊，网页这边就不再一条条弹提示 */
  draftProgress?: boolean;
}

/** 取桌面壳接口；不在壳里（或服务端渲染时）返回 null */
export function desktopShell(): XeditDesktop | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { xeditDesktop?: XeditDesktop }).xeditDesktop ?? null;
}

/** 当前是不是跑在 xEdit 桌面壳里 */
export function isDesktopShell(): boolean {
  return desktopShell() !== null;
}
