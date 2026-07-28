/**
 * 同步引擎：镜像库 ↔ 云端 的后台推拉。
 * 推：dirty 镜像 PUT 上云、未登录期建的 local- 文档 POST 上云后移除本地副本；
 * 拉：首次 ?full=1 全量建镜像，此后按 updatedAt 游标 ?since= 增量拉取
 * （dirty 的本地优先跳过），删除靠响应附带的存活 id 列表对账。
 * 触发：startSync()（进入工作台）、网络恢复、页面回到前台、保存后。
 */

import {
  applyServerDoc,
  listDirtyMirrorDocs,
  listMirrorDocs,
  getMirrorContent,
  markMirrorSynced,
  reconcileMirror,
  SYNC_CURSOR_KEY,
  type ServerDoc,
} from "./docStore";
import { listLocalDocs, getLocalDocContent, deleteLocalDoc, isLocalId } from "./localDocs";

export const SYNC_DONE_EVENT = "xedit:sync-done";

let syncing = false;
let pendingRerun = false;

const online = () => typeof navigator === "undefined" || navigator.onLine;

/** 推送单篇 dirty 镜像；true = 云端已确认 */
export async function pushMirrorDoc(id: string): Promise<boolean> {
  if (!online() || isLocalId(id)) return false;
  const dirty = listDirtyMirrorDocs().find((d) => d.id === id);
  if (!dirty) return true;
  // 镜像正文尚未拉到（如刚登录只改了分类）时只推元数据，接口支持部分更新
  const content = getMirrorContent(id);
  try {
    const res = await fetch(`/api/documents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: dirty.title,
        category: dirty.category ?? "未分类",
        ...(content === null ? {} : { content }),
      }),
    });
    if (!res.ok) return false;
    const doc = await res.json().catch(() => null);
    markMirrorSynced(id, typeof doc?.updatedAt === "string" ? doc.updatedAt : undefined);
    return true;
  } catch {
    return false;
  }
}

/** 未登录期间建的本地文档批量上云，成功一篇删一篇（失败的留待下次） */
async function drainLocalDocs(): Promise<number> {
  let uploaded = 0;
  for (const meta of listLocalDocs()) {
    const content = getLocalDocContent(meta.id);
    if (content === null) continue;
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meta.title, content, category: meta.category }),
      });
      if (!res.ok) break;
      const doc = (await res.json()) as ServerDoc;
      applyServerDoc({ ...doc, content });
      deleteLocalDoc(meta.id);
      uploaded++;
    } catch {
      break;
    }
  }
  return uploaded;
}

/** 一轮完整同步：先推后拉。并发调用会合并成「跑完再补一轮」 */
export async function syncNow(): Promise<void> {
  if (!online()) return;
  if (syncing) {
    pendingRerun = true;
    return;
  }
  syncing = true;
  try {
    // 推：dirty 镜像
    for (const d of listDirtyMirrorDocs()) {
      const ok = await pushMirrorDoc(d.id);
      if (!ok) break; // 网络/权限问题，本轮放弃，保持 dirty 下次再推
    }
    // 推：待上云的本地文档
    await drainLocalDocs();
    // 拉：有游标且镜像在（防 localStorage 被部分清掉）走增量，只下发有变化的正文；
    // 否则全量建镜像。增量响应附带全量存活 id，彻底删除靠 reconcile 对账。
    const cursor = localStorage.getItem(SYNC_CURSOR_KEY);
    const delta = cursor !== null && listMirrorDocs().length > 0;
    const res = await fetch(
      delta ? `/api/documents?since=${encodeURIComponent(cursor)}` : "/api/documents?full=1"
    );
    if (res.ok) {
      const body = (await res.json()) as
        | ServerDoc[]
        | { docs: (ServerDoc & { deletedAt: string | null })[]; ids: string[] };
      // 游标取服务端 updatedAt 的最大值，不碰本地时钟；同格式 ISO 串可直接字典序比较
      let latest = cursor ?? "";
      let liveIds: Set<string>;
      if (Array.isArray(body)) {
        liveIds = new Set();
        for (const doc of body) {
          liveIds.add(doc.id);
          applyServerDoc(doc);
          if (doc.updatedAt > latest) latest = doc.updatedAt;
        }
      } else {
        liveIds = new Set(body.ids);
        for (const doc of body.docs) {
          // 软删的只用来推进游标；从镜像移除交给下面的 reconcile（dirty 的会被保住）
          if (!doc.deletedAt) applyServerDoc(doc);
          if (doc.updatedAt > latest) latest = doc.updatedAt;
        }
      }
      reconcileMirror(liveIds);
      if (latest) localStorage.setItem(SYNC_CURSOR_KEY, latest);
      window.dispatchEvent(new CustomEvent(SYNC_DONE_EVENT));
    }
  } catch {
    // 离线或服务端异常：镜像保持现状，下次触发再试
  } finally {
    syncing = false;
    if (pendingRerun) {
      pendingRerun = false;
      void syncNow();
    }
  }
}

/** 常驻触发器：进入工作台时调用一次，返回清理函数 */
export function startSync(): () => void {
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  void syncNow();
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
