"use client";

/**
 * Vault 会话：谁是当前库、有没有权限、开关库的动作都在这里。
 * 目录句柄存 IndexedDB（可结构化克隆），localStorage 另留一个标记位给 layout 的启动脚本看；
 * 刷新后浏览器可能把权限降回 prompt，所以要留一个「待授权」态，等用户手势再 requestPermission。
 */

import { useSyncExternalStore } from "react";
import { toast } from "@/components/Toast";
import { getBrowserBackend, setLocalBackend } from "./index";
import { idbDel, idbGet, idbSet } from "./idbKv";
import { openVaultBackend, type RescanResult, type VaultBackend } from "./vaultBackend";
import {
  isVaultSupported,
  pickVaultDirectory,
  queryVaultPermission,
  requestVaultPermission,
} from "./vaultFs";

export { isVaultSupported };

export type VaultStatus = "none" | "pending" | "opening" | "open";
export interface VaultState {
  status: VaultStatus;
  name: string | null;
  error: string | null;
  /** 库是不是当前的 LocalBackend。本地模式 true；云端模式 false ——
   *  库还开着（句柄与后端都留着，同步引擎照样读写），但界面上脱钩：
   *  列表/编辑器/回收站/图床全按云端模式走，Vault 只是个同步文件夹 */
  attached: boolean;
}

const HANDLE_KEY = "vault-handle";
const FLAG_KEY = "xedit-vault";

/** 服务端快照必须是稳定引用，否则 useSyncExternalStore 水合时会死循环 */
const CLOSED: VaultState = { status: "none", name: null, error: null, attached: false };

let state: VaultState = CLOSED;
let handle: FileSystemDirectoryHandle | null = null;
let backend: VaultBackend | null = null;
let restored = false;
/** 想要的挂载模式（本地模式挂上、云端模式脱钩）：开库晚于登录态确定时也能按它落位 */
let wantAttached = true;
const listeners = new Set<() => void>();

function setState(next: Partial<VaultState>): void {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export function getVaultState(): VaultState {
  return state;
}

export function subscribeVault(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function useVaultSession(): VaultState {
  return useSyncExternalStore(subscribeVault, getVaultState, () => CLOSED);
}

/** 当前充当本地文档库的那个 Vault：脱钩时返回 null，
 *  于是图床/回收站/列表这些调用方自动走云端逻辑，不必各自判断登录态 */
export function getActiveVault(): VaultBackend | null {
  return state.attached ? backend : null;
}

/** 只要库还开着就返回（脱钩也给）：同步引擎要的是「那个文件夹」，与界面挂在谁身上无关 */
export function getSyncVault(): VaultBackend | null {
  return backend;
}

/**
 * 切换挂载模式：登录进云端模式就脱钩，退出登录回本地模式再挂回来。
 * 库开着就立刻切后端（setLocalBackend 自己会广播 LOCAL_BACKEND_CHANGED_EVENT）；
 * 还没开库就只记下意愿，activate 时按它落位。
 */
export function setVaultAttachMode(attached: boolean): void {
  wantAttached = attached;
  const b = backend;
  if (!b) {
    if (state.attached) setState({ attached: false });
    return;
  }
  if (state.attached === attached) return;
  if (attached) {
    setLocalBackend(b);
    setState({ attached: true });
    return;
  }
  // 脱钩前把排着的写落盘。队列换不换后端都会跑完，所以不必等它回来
  void b.flush().catch(() => undefined);
  setLocalBackend(getBrowserBackend());
  setState({ attached: false });
}

/** 与磁盘对账：外部（Obsidian 等）改过的文件反映进缓存，返回变动的文档 id；没开库返回 null */
export async function rescanVault(): Promise<RescanResult | null> {
  const b = backend;
  if (!b) return null;
  return await b.rescan();
}

/** 标记位只是给启动脚本判断「这台机器开过库」，真正的句柄在 IndexedDB */
function setFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    // 隐私模式写不了就算了
  }
}

/** 这台机器上次开过库？句柄在 IndexedDB 里，读它要等异步，
 *  界面首帧得靠这个同步标记决定「先等一下」还是「直接按浏览器存储渲染」 */
export function hasStoredVault(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** 扫库建缓存并把后端换成 Vault；失败就留在「待授权」等用户重试 */
async function activate(h: FileSystemDirectoryHandle): Promise<boolean> {
  setState({ status: "opening", name: h.name, error: null });
  try {
    const b = await openVaultBackend(h);
    handle = h;
    backend = b;
    // 云端模式下开库只是「准备好同步文件夹」，界面仍走镜像，所以不换本地后端
    if (wantAttached) setLocalBackend(b);
    setState({ status: "open", name: b.name, error: null, attached: wantAttached });
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    handle = h;
    backend = null;
    setState({ status: "pending", name: h.name, error: msg, attached: false });
    toast("打开文件夹失败：" + msg, "error");
    return false;
  }
}

/** 启动时恢复上次的库，只跑一次。权限还在就直接打开，掉了就等用户点一下 */
export async function restoreVaultOnStartup(): Promise<void> {
  if (restored) return;
  restored = true;
  if (!isVaultSupported()) return;
  const h = await readHandle();
  if (!h) {
    setFlag(false);
    return;
  }
  handle = h;
  const perm = await queryVaultPermission(h).catch(() => "denied" as PermissionState);
  if (perm === "granted") {
    await activate(h);
    return;
  }
  setState({ status: "pending", name: h.name, error: null, attached: false });
}

/** 必须在用户手势里调；拿不到权限就停在 pending */
export async function resumeVault(): Promise<boolean> {
  handle ??= await readHandle();
  if (!handle) {
    setFlag(false);
    setState(CLOSED);
    return false;
  }
  const ok = await requestVaultPermission(handle).catch(() => false);
  if (!ok) {
    setState({
      status: "pending",
      name: handle.name,
      error: "没拿到文件夹的读写权限",
      attached: false,
    });
    return false;
  }
  return await activate(handle);
}

export type OpenVaultResult = "opened" | "cancelled" | "unsupported" | "failed";

export async function openVaultFromPicker(): Promise<OpenVaultResult> {
  if (!isVaultSupported()) return "unsupported";
  let picked: FileSystemDirectoryHandle | null = null;
  try {
    picked = await pickVaultDirectory();
  } catch (e) {
    const msg = (e as Error).message;
    setState({ error: msg });
    toast("选择文件夹失败：" + msg, "error");
    return "failed";
  }
  if (!picked) return "cancelled";
  try {
    await idbSet(HANDLE_KEY, picked);
    setFlag(true);
  } catch {
    // 存不下句柄：本次会话照样能用，下次打开得重新选
  }
  return (await activate(picked)) ? "opened" : "failed";
}

/** 关库：先把队列里的写落盘，再切回浏览器后端 */
export async function closeVault(): Promise<void> {
  const b = backend;
  const wasAttached = state.attached;
  backend = null;
  handle = null;
  if (b) await b.flush().catch(() => undefined);
  // 脱钩状态下本地后端本来就是浏览器那个，不用再换
  if (wasAttached) setLocalBackend(getBrowserBackend());
  await idbDel(HANDLE_KEY).catch(() => undefined);
  setFlag(false);
  setState(CLOSED);
}

export function countBrowserDocs(): number {
  return getBrowserBackend().listDocs().length;
}

/** 把浏览器里攒的本地文档搬进当前库，搬一篇删一篇；由界面在用户确认后调用 */
export async function migrateBrowserDocsToVault(): Promise<number> {
  const vault = backend;
  if (!vault) return 0;
  const browser = getBrowserBackend();
  vault.saveCats(browser.listCats()); // 先把分类目录建起来
  let moved = 0;
  for (const meta of browser.listDocs()) {
    const content = browser.getContent(meta.id) ?? "";
    vault.createDoc({ title: meta.title, content, category: meta.category });
    browser.deleteDoc(meta.id);
    moved++;
  }
  browser.saveCats([]);
  await vault.flush();
  return moved;
}
