"use client";

/**
 * B 步：两端都在的一篇怎么比。
 * 三方比对 —— 索引里的哈希是「上次两端一致时」的 base，本地哈希与云端哈希（换回相对路径后再算）
 * 各自跟它比：只有一边变就单向搬，两边都变且内容不同才是冲突。
 * 冲突不提问：云端那版在库里另存成「xxx (云端副本).md」，本地版照旧上云，两边都不丢内容。
 * 两边都没变就什么都不做 —— 这是 SYNC_DONE 之后重跑时的稳态，一旦在这里打 dirty
 * 就会和 syncNow 互相触发，转个没完。
 */

import { UNCATEGORIZED } from "@/features/workspace/constants";
import { getMirrorMeta, saveMirrorLocal, type MirrorMeta } from "@/lib/docStore";
import { hasPendingContent, rememberSavedDocument } from "@/lib/editorPersistence";
import type { DocPatch, LocalDocMeta } from "@/lib/localBackend";
import { notifyDocReplaced } from "@/lib/localDocs";
import { useStore } from "@/store/useStore";
import { ensureMirrorContent, mirrorCategory } from "./cloudDocs";
import { linkDoc, type SyncRun } from "./index";
import type { SyncPair } from "./mapping";
import { toCloudContent, toLocalContent } from "./media";

const catOf = (meta: LocalDocMeta): string => meta.category?.trim() || UNCATEGORIZED;

export async function syncMappedDoc(
  run: SyncRun,
  pair: SyncPair,
  meta: LocalDocMeta
): Promise<void> {
  const { vault, idx } = run;
  const { cloudId, vaultId, ref } = pair;
  const mirror = getMirrorMeta(cloudId);
  if (!mirror) return; // 这一瞬间被别处删了，下一轮再说
  const store = useStore.getState();
  if (store.docId === cloudId && hasPendingContent(cloudId, store.content)) {
    // 编辑器里还有没落盘的改动：等自动保存落定（它会再发 DOCS_CHANGED），下一轮再比
    run.pending++;
    return;
  }
  const mirrorContent = await ensureMirrorContent(cloudId, run.online);
  if (mirrorContent === null) return; // 离线或拉不到正文：本篇跳过

  const relPath = vault.pathOf(vaultId) ?? ref.relPath;
  const localContent = vault.getContent(vaultId) ?? "";
  const localHash = run.hashOf(vaultId, localContent);
  const cloudLocal = toLocalContent(mirrorContent, idx);
  const cloudHash = run.hashOf(`cloud:${cloudId}`, cloudLocal);
  const localChanged = localHash !== ref.hash;
  const cloudChanged = cloudHash !== ref.hash;
  // 标题/分类变了就是文件换了位置，内容一样也要把新标题推上云
  const pathChanged = relPath !== ref.relPath;
  // 云端只改了标题/分类（正文没动）：与索引里记的云端值比，而不是与文件名比 ——
  // 文件名经过清洗/去重可能永远追不上云端标题，拿它比会每轮都「发现」变化改个没完
  const cloudMetaChanged =
    ref.title !== undefined &&
    (mirror.title !== ref.title || mirrorCategory(mirror) !== ref.category);
  if (!localChanged && !cloudChanged && !pathChanged && !cloudMetaChanged) return; // 稳态

  if (localChanged && cloudChanged && localHash !== cloudHash) {
    // 副本不做映射：下一轮它就是个普通的新文件，照常上云，于是两端都能看到
    vault.createDoc({
      title: `${meta.title} (云端副本)`,
      category: catOf(meta),
      content: cloudLocal,
    });
    run.conflicts++;
    run.listChanged = true;
  }

  if (localChanged || pathChanged) {
    await pushLocal(run, pair, meta, { relPath, content: localContent, hash: localHash });
    return;
  }
  if (cloudChanged) writeBackCloud(run, pair, meta, mirror, cloudLocal, cloudHash);
  else if (cloudMetaChanged) writeBackCloud(run, pair, meta, mirror);
}

/** 索引里的一条引用：哈希/路径之外把云端的标题分类也记下，下轮才分得清云端有没有改名 */
function refOf(relPath: string, hash: string, title: string, category: string) {
  return { relPath, hash, title, category };
}

/** 本地推云端：正文里的库内附件先上图床，再落镜像打 dirty，由 syncNow 推上去 */
async function pushLocal(
  run: SyncRun,
  pair: SyncPair,
  meta: LocalDocMeta,
  local: { relPath: string; content: string; hash: string }
): Promise<void> {
  const cloud = await toCloudContent(run.vault, local.content, run.idx);
  if (cloud.uploaded) run.dirtyIndex = true;
  run.mediaFailed += cloud.failed;
  const category = catOf(meta);
  // 文件名即标题，云端跟着本地改
  saveMirrorLocal(pair.cloudId, { title: meta.title, category, content: cloud.content });
  linkDoc(run, pair.cloudId, pair.vaultId, refOf(local.relPath, local.hash, meta.title, category));
  run.needPush = true;
  showInEditor(pair.cloudId, meta.title, cloud.content, category);
}

/** 云端写回本地：磁盘文件不是编辑器的数据源（编辑器打开的是云端 id），不必通知编辑器。
 *  不传 content 就是只改标题/分类（文件改名或搬目录），正文与哈希都不动 */
function writeBackCloud(
  run: SyncRun,
  pair: SyncPair,
  meta: LocalDocMeta,
  mirror: MirrorMeta,
  content?: string,
  hash?: string
): void {
  const { vault } = run;
  const patch: DocPatch = content === undefined ? {} : { content };
  if (mirror.title !== meta.title) patch.title = mirror.title;
  const category = mirrorCategory(mirror);
  if (category !== catOf(meta)) patch.category = category;
  if (Object.keys(patch).length) vault.updateDoc(pair.vaultId, patch);
  linkDoc(
    run,
    pair.cloudId,
    pair.vaultId,
    refOf(vault.pathOf(pair.vaultId) ?? pair.ref.relPath, hash ?? pair.ref.hash, mirror.title, category)
  );
  run.listChanged = true;
}

/**
 * 这篇正巧在编辑器里开着、且没有未保存的改动：把内容换成刚落镜像的这份
 * （与 useVaultWatch.applyExternalChange 同一套动作），否则用户按下保存会把旧内容写回去。
 */
function showInEditor(cloudId: string, title: string, content: string, category: string): void {
  const s = useStore.getState();
  if (s.docId !== cloudId || s.content === content) return;
  if (hasPendingContent(cloudId, s.content)) return;
  rememberSavedDocument({ docId: cloudId, title, content, category });
  s.setDoc({ id: cloudId, title, content });
  s.setCategory(category);
  // 编辑器持有自己的 CodeMirror 文档，光改 store 不会更新，得让它重挂载一次
  notifyDocReplaced(cloudId);
}
