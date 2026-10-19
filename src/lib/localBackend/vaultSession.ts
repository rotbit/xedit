"use client";

/**
 * Vault session: the current library, its permission state, and open/close actions all live here.
 * The folder handle is stored in IndexedDB (structured-cloneable); localStorage keeps a flag for layout's boot script;
 * after a refresh the browser may drop the permission back to prompt, so there's a "pending" state that waits for a user gesture to requestPermission.
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
import { t } from "@/i18n/t";

export { isVaultSupported };

export type VaultStatus = "none" | "pending" | "opening" | "open";
export interface VaultState { status: VaultStatus; name: string | null; error: string | null }

const HANDLE_KEY = "vault-handle";
const FLAG_KEY = "xedit-vault";

/** The server snapshot must be a stable reference, or useSyncExternalStore loops forever during hydration */
const CLOSED: VaultState = { status: "none", name: null, error: null };

let state: VaultState = CLOSED;
let handle: FileSystemDirectoryHandle | null = null;
let backend: VaultBackend | null = null;
let restored = false;
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

export function getActiveVault(): VaultBackend | null {
  return backend;
}

/** Rescan disk: reflect files changed externally (Obsidian etc.) into the cache, returning changed document ids; null if no library is open */
export async function rescanVault(): Promise<RescanResult | null> {
  const b = backend;
  if (!b) return null;
  return await b.rescan();
}

/** The flag only tells the boot script "this machine has opened a library"; the real handle is in IndexedDB */
function setFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    // If private mode can't write it, never mind
  }
}

/** Has this machine opened a library before? The handle is in IndexedDB and reading it is async,
 *  so the first frame relies on this sync flag to decide between "wait a moment" and "render from browser storage" */
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

/** Scan the library, build the cache and swap the backend to the Vault; on failure stay "pending" for the user to retry */
async function activate(h: FileSystemDirectoryHandle): Promise<boolean> {
  setState({ status: "opening", name: h.name, error: null });
  try {
    const b = await openVaultBackend(h);
    handle = h;
    backend = b;
    setLocalBackend(b);
    setState({ status: "open", name: b.name, error: null });
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    handle = h;
    backend = null;
    setState({ status: "pending", name: h.name, error: msg });
    toast(t("打开文件夹失败：{msg}", { msg }), "error");
    return false;
  }
}

/** Restore the last library on startup, once only. Open directly if permission remains; otherwise wait for a user click */
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
  setState({ status: "pending", name: h.name, error: null });
}

/** Must be called in a user gesture; stays pending if permission isn't granted */
export async function resumeVault(): Promise<boolean> {
  handle ??= await readHandle();
  if (!handle) {
    setFlag(false);
    setState(CLOSED);
    return false;
  }
  const ok = await requestVaultPermission(handle).catch(() => false);
  if (!ok) {
    setState({ status: "pending", name: handle.name, error: t("没拿到文件夹的读写权限") });
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
    toast(t("选择文件夹失败：{msg}", { msg }), "error");
    return "failed";
  }
  if (!picked) return "cancelled";
  try {
    await idbSet(HANDLE_KEY, picked);
    setFlag(true);
  } catch {
    // Couldn't store the handle: this session still works, but next time the folder must be picked again
  }
  return (await activate(picked)) ? "opened" : "failed";
}

/** Close the library: flush queued writes first, then switch back to the browser backend */
export async function closeVault(): Promise<void> {
  const b = backend;
  backend = null;
  handle = null;
  if (b) await b.flush().catch(() => undefined);
  setLocalBackend(getBrowserBackend());
  await idbDel(HANDLE_KEY).catch(() => undefined);
  setFlag(false);
  setState(CLOSED);
}

/**
 * Suspend after login: in cloud mode, "local documents" should only be the browser docs waiting to upload;
 * disk files must not mix into the cloud list or receive offline drafts. The handle is kept and restored on logout back to local mode.
 */
export async function suspendVault(): Promise<void> {
  const b = backend;
  if (!b) return;
  backend = null;
  await b.flush().catch(() => undefined);
  setLocalBackend(getBrowserBackend());
  restored = false;
  setState(CLOSED);
}

export function countBrowserDocs(): number {
  return getBrowserBackend().listDocs().length;
}

/** Move local documents accumulated in the browser into the current library, deleting each after it's moved; called by the UI after user confirmation */
export async function migrateBrowserDocsToVault(): Promise<number> {
  const vault = backend;
  if (!vault) return 0;
  const browser = getBrowserBackend();
  vault.saveCats(browser.listCats()); // Create category folders first
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
