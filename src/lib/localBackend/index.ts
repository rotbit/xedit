/**
 * 本地文档库的后端注册处：默认走浏览器 localStorage，
 * 后续接磁盘 Vault 时 setLocalBackend 换一个实现即可，门面与调用方都不动。
 */

import { createBrowserBackend } from "./browserBackend";
import type { LocalBackend } from "./types";

export type { DocInit, DocPatch, LocalBackend, LocalDocMeta } from "./types";
export { summarize } from "./types";

/** 后端被替换（打开/关闭 Vault）时广播，供依赖本地库的视图整体重载 */
export const LOCAL_BACKEND_CHANGED_EVENT = "xedit:local-backend-changed";

let active: LocalBackend | null = null;
let browser: LocalBackend | null = null;

/** 始终是 localStorage 那个后端：切到 Vault 后仍要用它做迁移 */
export function getBrowserBackend(): LocalBackend {
  browser ??= createBrowserBackend();
  return browser;
}

export function getLocalBackend(): LocalBackend {
  active ??= getBrowserBackend();
  return active;
}

export function setLocalBackend(b: LocalBackend): void {
  active = b;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCAL_BACKEND_CHANGED_EVENT));
}
