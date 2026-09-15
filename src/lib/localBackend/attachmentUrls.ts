/**
 * 附件的显示地址：正文里存的是相对路径（"attachments/xxx.png"），<img> 要的是 object URL。
 * 渲染管线（markdown-it 的图片规则、CodeMirror 的图片部件）全是同步的，等不了文件读取，
 * 所以这里维护一份同步缓存：命中直接给 URL，没命中先返回 null 再去后台读，
 * 读到之后派 xedit:attachments-resolved，预览与编辑器各自重渲染一次把空图换成真图。
 */

import { getLocalBackend, LOCAL_BACKEND_CHANGED_EVENT } from "./index";
import type { VaultBackend } from "./vaultBackend";

/** 有附件读出来了：预览与编辑器听到后重渲染一次 */
export const ATTACHMENTS_RESOLVED_EVENT = "xedit:attachments-resolved";

/** 附件目录前缀，与 vaultFs 的 ATTACHMENTS_DIR 对应 */
const PREFIX = "attachments/";
/** 合并同一批解析的重渲染：一篇十张图不该触发十次 */
const NOTIFY_GAP = 50;

/** 相对路径 → object URL */
const urls = new Map<string, string>();
/** 正在读的路径：同一张图并发渲染多次也只读一次 */
const loading = new Set<string>();
/** 读不到的路径：记下来免得每次击键重渲染都去磁盘上再找一遍；换库或对账后清掉 */
const missing = new Set<string>();
/** 换库计数：切库前发出的读取回来时已作废，不能再塞进缓存 */
let generation = 0;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

/** 正文里可能写成 "./attachments/x.png"，按库根的相对路径归一 */
const toRel = (src: string): string => src.replace(/^\.?\/+/, "");

/** 当前是磁盘文库吗？故意不走 vaultSession（那是 "use client" 模块，
 *  而这个文件被 markdown 渲染管线引着，得留在通用模块里） */
function activeVault(): VaultBackend | null {
  if (typeof window === "undefined") return null;
  const backend = getLocalBackend();
  return backend.kind === "vault" ? (backend as VaultBackend) : null;
}

/** 是库里的相对路径（而非 http / blob / data 地址） */
export function isAttachmentSrc(src: string): boolean {
  return toRel(src).startsWith(PREFIX);
}

/** 命中缓存返回 object URL；没命中返回 null 并在后台读，读到后派事件 */
export function resolveAttachmentSrc(src: string): string | null {
  const rel = toRel(src);
  const hit = urls.get(rel);
  if (hit) return hit;
  void load(rel);
  return null;
}

/** 打开文档时先把正文里的附件读起来，少几帧空图 */
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
  // 读不到（文件被删掉或改了名）就留着原路径：预览里是张裂图，比无休止重试好
  if (!url) {
    missing.add(rel);
    return;
  }
  urls.set(rel, url);
  scheduleNotify();
}

function scheduleNotify(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    window.dispatchEvent(new CustomEvent(ATTACHMENTS_RESOLVED_EVENT));
  }, NOTIFY_GAP);
}

/** 换库（开库 / 关库 / 登录后挂起）时旧 URL 全部作废：blob 指向的是上一个文件夹 */
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

/** 磁盘对账之后调用：外部可能补回了之前找不到的图，让它们有机会再读一次 */
export function forgetMissingAttachments(): void {
  missing.clear();
}

/** 正文里的图片引用：![alt](src) 与 ![alt](<src>) 两种写法都认 */
const IMAGE_REF = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;

/**
 * 内容要离开本机（复制到公众号、导出 docx）时调用：把正文里的 attachments/ 相对路径
 * 换成 base64 的 data URL。公众号编辑器粘贴时会把内联图片转存到自己的服务器，不会裂图；
 * 读不到的图保留原路径。没开磁盘文库时原样返回。
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
