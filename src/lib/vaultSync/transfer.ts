"use client";

/**
 * C / D / E 步：单端才有的那些篇怎么办。
 * C 只有本地有 → 当新文档上云（先认亲：镜像里存在「期望路径与正文都对得上」的未映射文档，
 *   那就是同一篇，只补映射不传输，避免刚登录时把每篇都上传成第二份）。
 * D 只有云端有 → 下载进库；目标文件名被别的文件占着就另存成「(云端副本)」。
 * E 一端已经没了 → 删另一端：本地文件没了就软删云端，云端删了本地就进 .trash。
 * 离线或请求失败都只计 pending，下轮再试。
 */

import { UNCATEGORIZED } from "@/features/workspace/constants";
import { applyServerDoc, getMirrorContent, removeMirrorDoc, type MirrorMeta } from "@/lib/docStore";
import type { LocalDocMeta } from "@/lib/localBackend";
import {
  createCloudDoc,
  deleteCloudDoc,
  ensureMirrorContent,
  expectedRelPath,
  mirrorCategory,
} from "./cloudDocs";
import { linkDoc, noteError, unlinkDoc, type SyncRun } from "./index";
import type { Mapping } from "./mapping";
import { toCloudContent, toLocalContent } from "./media";

/** C：没被认领的本地文件 → 新的云端文档 */
export async function pushNewLocalDocs(
  run: SyncRun,
  map: Mapping,
  localById: Map<string, LocalDocMeta>
): Promise<void> {
  for (const vaultId of [...map.unmappedLocal]) {
    const meta = localById.get(vaultId);
    if (!meta) continue;
    try {
      await pushOne(run, map, vaultId, meta);
    } catch (e) {
      noteError(run, e);
    }
  }
}

async function pushOne(
  run: SyncRun,
  map: Mapping,
  vaultId: string,
  meta: LocalDocMeta
): Promise<void> {
  const { vault } = run;
  const relPath = vault.pathOf(vaultId);
  if (!relPath) return;
  const content = vault.getContent(vaultId) ?? "";
  const hash = run.hashOf(vaultId, content);
  const twin = findTwin(run, map, relPath, hash);
  if (twin) {
    const m = map.unmappedCloud.get(twin);
    linkDoc(run, twin, vaultId, {
      relPath,
      hash,
      title: m?.title ?? meta.title,
      category: m ? mirrorCategory(m) : meta.category?.trim() || UNCATEGORIZED,
    });
    map.unmappedCloud.delete(twin);
    map.unmappedLocal.delete(vaultId);
    return;
  }
  if (!run.online) {
    run.pending++;
    return;
  }
  const cloud = await toCloudContent(vault, content, run.idx);
  if (cloud.uploaded) run.dirtyIndex = true;
  run.mediaFailed += cloud.failed;
  const category = meta.category?.trim() || UNCATEGORIZED;
  const doc = await createCloudDoc({ title: meta.title, content: cloud.content, category });
  if (!doc) {
    run.pending++; // 建不上去（离线/超限/只读）：下轮再试
    return;
  }
  applyServerDoc(doc);
  linkDoc(run, doc.id, vaultId, { relPath, hash, title: meta.title, category });
  map.unmappedLocal.delete(vaultId);
  run.listChanged = true;
}

/** 认亲：期望路径与正文都对得上的未映射云端文档，就是同一篇 */
function findTwin(run: SyncRun, map: Mapping, relPath: string, hash: string): string | null {
  for (const [id, mirror] of map.unmappedCloud) {
    if (expectedRelPath(mirror) !== relPath) continue;
    const content = getMirrorContent(id);
    if (content === null) continue; // 正文还没拉下来，没法比，交给 D 步下载
    if (run.hashOf(`cloud:${id}`, toLocalContent(content, run.idx)) === hash) return id;
  }
  return null;
}

/** D：镜像里有、索引里没有的云端文档 → 下载进库。
 *  strangers 是 C 步开始前没被认领的本地文件：它们即便刚被 C 推上云，
 *  对这篇云端文档来说仍是「同名的另一篇」，占了路径就得另存副本 */
export async function pullNewCloudDocs(
  run: SyncRun,
  map: Mapping,
  strangers: Set<string>
): Promise<void> {
  for (const [cloudId, mirror] of map.unmappedCloud) {
    try {
      await pullOne(run, strangers, cloudId, mirror);
    } catch (e) {
      noteError(run, e);
    }
  }
}

async function pullOne(
  run: SyncRun,
  strangers: Set<string>,
  cloudId: string,
  mirror: MirrorMeta
): Promise<void> {
  const { vault } = run;
  const content = await ensureMirrorContent(cloudId, run.online);
  if (content === null) return; // 离线或拉不到正文：下轮再说
  const local = toLocalContent(content, run.idx);
  const holder = vault.idAtPath(expectedRelPath(mirror));
  // 期望路径被一个没配上对的本地文件占着 → 那是另一篇，云端这版另存；
  // 被早已映射的文件占着（云端本来就有两篇同名）则交给 createDoc 自己加 " 1" 后缀
  const title = holder && strangers.has(holder) ? `${mirror.title} (云端副本)` : mirror.title;
  const category = mirrorCategory(mirror);
  const meta = vault.createDoc({ title, category, content: local });
  linkDoc(run, cloudId, meta.id, {
    relPath: vault.pathOf(meta.id) ?? "",
    hash: run.hashOf(meta.id, local),
    title: mirror.title,
    category,
  });
  run.listChanged = true;
}

/** E：删除对齐 */
export async function alignDeletions(run: SyncRun, map: Mapping): Promise<void> {
  for (const cloudId of map.localGone) {
    try {
      if (!run.online || !(await deleteCloudDoc(cloudId))) {
        run.pending++; // 映射留着，下轮再删
        continue;
      }
      removeMirrorDoc(cloudId);
      unlinkDoc(run, cloudId);
      run.listChanged = true;
    } catch (e) {
      noteError(run, e);
    }
  }
  for (const { cloudId, vaultId } of map.cloudGone) {
    try {
      // 云端删的：本地进 .trash（不是真删，用户还能还原）
      run.vault.deleteDoc(vaultId);
      unlinkDoc(run, cloudId);
      run.listChanged = true;
    } catch (e) {
      noteError(run, e);
    }
  }
}
