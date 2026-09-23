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
  /** 客户端版本（package.json 的 version，形如 "0.1.1"）；0.1.1 之前的壳没有这个字段 */
  version?: string;
}

/** 「发送到公众号」依赖壳内置的草稿服务，这个版本起才有；更早的壳会连不上服务 */
export const WECHAT_DRAFT_MIN_VERSION = "0.1.1";

/** 取桌面壳接口；不在壳里（或服务端渲染时）返回 null */
export function desktopShell(): XeditDesktop | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { xeditDesktop?: XeditDesktop }).xeditDesktop ?? null;
}

/** 当前是不是跑在 xEdit 桌面壳里 */
export function isDesktopShell(): boolean {
  return desktopShell() !== null;
}

/** 把 "0.1.1" 这类版本号拆成数字段，非数字段当 0 */
const parts = (v: string): number[] => v.split(".").map((n) => Number.parseInt(n, 10) || 0);

/**
 * 当前桌面壳版本是否不低于 min。不在壳里、或壳太旧没报版本，都算不满足。
 * 只在客户端里比较，服务端渲染时恒为 false（调用方须在点击后才读，避免水合不一致）。
 */
export function desktopVersionAtLeast(min: string): boolean {
  const v = desktopShell()?.version;
  if (!v) return false;
  const a = parts(v);
  const b = parts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
