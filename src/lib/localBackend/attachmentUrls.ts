/**
 * Display URLs for attachments: the body stores relative paths ("attachments/xxx.png"), but <img> needs an object URL.
 * The render pipeline (markdown-it's image rule, CodeMirror's image widget) is fully synchronous and can't wait on file reads,
 * so we keep a sync cache: on hit return the URL, on miss return null and read in the background;
 * once read, dispatch xedit:attachments-resolved so preview and editor each re-render once, swapping blanks for real images.
 */

import { getLocalBackend, LOCAL_BACKEND_CHANGED_EVENT } from "./index";
import type { VaultBackend } from "./vaultBackend";

/** Some attachments finished loading: preview and editor re-render once on hearing this.
 *  detail.keys lists the relative paths in this batch so subscribers can tell whether it concerns their document */
export const ATTACHMENTS_RESOLVED_EVENT = "xedit:attachments-resolved";

/** Attachment directory prefix; matches vaultFs's ATTACHMENTS_DIR */
const PREFIX = "attachments/";
/** Coalesce re-renders for one batch: ten images in a document shouldn't trigger ten renders */
const NOTIFY_GAP = 50;

/** Relative path → object URL */
const urls = new Map<string, string>();
/** Paths being read: the same image rendered concurrently is still read only once */
const loading = new Set<string>();
/** Paths that couldn't be read: remembered so every keystroke re-render doesn't hit disk again; cleared on library switch or rescan */
const missing = new Set<string>();
/** Library switch counter: reads issued before a switch are stale when they return and must not enter the cache */
let generation = 0;
/** Relative paths read in this batch, dispatched with the event */
const resolved = new Set<string>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

/** The body may say "./attachments/x.png"; normalize to a path relative to the library root */
const toRel = (src: string): string => src.replace(/^\.?\/+/, "");

/** Is the current library on disk? Deliberately avoids vaultSession (a "use client" module,
 *  while this file is pulled in by the markdown pipeline and must stay a universal module) */
function activeVault(): VaultBackend | null {
  if (typeof window === "undefined") return null;
  const backend = getLocalBackend();
  return backend.kind === "vault" ? (backend as VaultBackend) : null;
}

/** A relative path inside the library (not an http / blob / data URL) */
export function isAttachmentSrc(src: string): boolean {
  return toRel(src).startsWith(PREFIX);
}

/** On cache hit return the object URL; on miss return null, read in the background and dispatch an event when done */
export function resolveAttachmentSrc(src: string): string | null {
  const rel = toRel(src);
  const hit = urls.get(rel);
  if (hit) return hit;
  void load(rel);
  return null;
}

/** Preload the body's attachments when a document opens, for fewer frames of blank images */
export function prefetchAttachments(content: string): void {
  if (!activeVault()) return;
  for (const m of content.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) {
    if (isAttachmentSrc(m[1])) void load(toRel(m[1]));
  }
}

async function load(rel: string): Promise<void> {
  if (urls.has(rel) || loading.has(rel) || missing.has(rel)) return;
  const vault = activeVault();
  if (!vault) return;
  loading.add(rel);
  watchBackend();
  const gen = generation;
  const url = await vault.getAttachmentUrl(rel).catch(() => null);
  loading.delete(rel);
  if (gen !== generation) return;
  // Unreadable (file deleted or renamed): keep the original path. A broken image in preview beats endless retries
  if (!url) {
    missing.add(rel);
    return;
  }
  urls.set(rel, url);
  resolved.add(rel);
  scheduleNotify();
}

function scheduleNotify(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const keys = [...resolved];
    resolved.clear();
    window.dispatchEvent(new CustomEvent(ATTACHMENTS_RESOLVED_EVENT, { detail: { keys } }));
  }, NOTIFY_GAP);
}

/** On library switch (open / close / suspend after login) all old URLs are stale: the blobs point at the previous folder */
function watchBackend(): void {
  if (watching) return;
  watching = true;
  window.addEventListener(LOCAL_BACKEND_CHANGED_EVENT, () => {
    generation++;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    loading.clear();
    missing.clear();
  });
}

/** Call after a disk rescan: images that were missing may have been restored externally, so let them be read again */
export function forgetMissingAttachments(): void {
  missing.clear();
}

/** Image references in the body: both ![alt](src) and ![alt](<src>) forms */
const IMAGE_REF = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;

/**
 * Call when content leaves this machine (copying to WeChat, exporting docx): replace attachments/ relative paths
 * in the body with base64 data URLs. The WeChat editor re-hosts inline images on paste, so nothing breaks;
 * unreadable images keep their original path. Returns the input unchanged when no disk library is open.
 */
export async function inlineAttachments(markdown: string): Promise<string> {
  const vault = activeVault();
  if (!vault) return markdown;
  const refs = new Set<string>();
  for (const m of markdown.matchAll(IMAGE_REF)) if (isAttachmentSrc(m[1])) refs.add(m[1]);
  if (refs.size === 0) return markdown;
  const dataUrls = new Map<string, string>();
  await Promise.all(
    [...refs].map(async (src) => {
      const url = await vault.getAttachmentUrl(toRel(src)).catch(() => null);
      if (!url) return;
      const blob = await fetch(url).then((r) => r.blob());
      dataUrls.set(src, await blobToDataUrl(blob));
    })
  );
  return markdown.replace(IMAGE_REF, (whole, src: string) => {
    const data = dataUrls.get(src);
    return data ? whole.slice(0, whole.length - src.length) + data : whole;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
