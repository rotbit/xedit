/**
 * 同步引擎：镜像库 ↔ 云端 的后台推拉。
 * 推：dirty 镜像 PUT 上云、未登录期建的 local- 文档 POST 上云后移除本地副本；
 * 拉：首次 ?full=1 全量建镜像，此后按 updatedAt 游标 ?since= 增量拉取
 * （dirty 的本地优先跳过），删除靠响应附带的存活 id 列表对账。
 * 触发：startSync()（进入工作台）、网络恢复、页面回到前台、保存后。
 *
 * 三条「别把内容弄丢」的规矩贯穿全文件：
 * 1. 同一篇同一时刻只有一个 PUT 在飞，期间的新编辑合并成下一轮，不会互相盖；
 * 2. 响应回来先对代际（换账号）和 rev（在途又改了），对不上就不写本地状态；
 * 3. 推失败一律保留 dirty，宁可多推一次也不让本地改动悄悄消失。
 */

import {
  applyServerDoc,
  applyServerDocs,
  listDirtyMirrorDocs,
  listMirrorDocs,
  getMirrorContent,
  getMirrorMeta,
  markMirrorSynced,
  rebaseMirror,
  reconcileMirror,
  saveMirrorLocal,
  SYNC_CURSOR_KEY,
  type ServerDoc,
} from "./docStore";
import { getBrowserBackend } from "./localBackend";
import { isSyncHeld } from "./mirrorOwner";
import { isLocalId } from "./localDocs";
import { getSessionEpoch, isCurrentEpoch } from "./sessionEpoch";
import { toast } from "@/components/Toast";
import { UNCATEGORIZED } from "@/lib/docDefaults";

export const SYNC_DONE_EVENT = "xedit:sync-done";

/** 一轮同步里同时推几篇：再多也只是抢同一条上行带宽，还容易撞上服务端限流 */
const PUSH_CONCURRENCY = 3;

/** 网络抖动 / 服务端 5xx 的重试间隔，用完还不成就留着 dirty 等下一次触发 */
const RETRY_DELAYS = [1000, 3000];

let syncing = false;
let pendingRerun = false;

const online = () => typeof navigator === "undefined" || navigator.onLine;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 单飞队列：每篇文章最多一个在途 PUT，飞行期间来的推送请求合并成「再跑一轮」 */
interface PushEntry {
  running: Promise<boolean>;
  again: boolean;
}
const inFlight = new Map<string, PushEntry>();

/** 这篇是否正有推送在飞（页面隐藏时的 keepalive 据此让路，避免同一篇两个请求打架） */
export function isPushInFlight(id: string): boolean {
  return inFlight.has(id);
}

/**
 * 带有界重试的 PUT。网络异常与 5xx 才重试（延迟 1s、3s），
 * 4xx 包括 409 冲突重试多少次结果都一样，直接把响应交给上层处理。
 * 返回 null = 这次没拿到可用响应（网络异常、重试用尽或代际已变）。
 */
async function putMirror(id: string, body: unknown, epoch: number): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`/api/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      res = null; // 断网 / DNS 失败等
    }
    if (!isCurrentEpoch(epoch)) return null;
    if (res && res.status < 500) return res;
    if (attempt >= RETRY_DELAYS.length) return res;
    await sleep(RETRY_DELAYS[attempt]);
    if (!isCurrentEpoch(epoch) || !online()) return null;
  }
}

/**
 * 给云端当前内容留一个历史版本。版本接口存的就是「服务端此刻那份」，
 * 所以冲突时先调它一次，被本地覆盖掉的那份改动用户还能从版本列表里找回来。
 */
async function archiveServerVersion(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/documents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 不带 kind：按手动存档处理，只去重不节流，免得这份「即将被覆盖的内容」被节流丢掉
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 推送一篇 dirty 镜像（不含队列逻辑，队列见 pushMirrorDoc）。
 * true = 这一趟云端确认了；失败一律保留 dirty。
 */
async function uploadMirrorDoc(id: string): Promise<boolean> {
  if (!online() || isLocalId(id)) return false;
  const meta = getMirrorMeta(id);
  if (!meta?.dirty) return true;
  // 镜像正文尚未拉到（如刚登录只改了分类）时只推元数据，接口支持部分更新
  const content = getMirrorContent(id);
  // 出发时的快照：响应回来时拿它判断这次确认还算不算数
  const epoch = getSessionEpoch();
  const rev = meta.rev ?? 0;
  let base = meta.baseUpdatedAt;
  const payload = {
    title: meta.title,
    category: meta.category ?? UNCATEGORIZED,
    ...(content === null ? {} : { content }),
  };
  /** 上一轮是冲突回来的：这一轮成功后要告诉用户云端那份去哪了 */
  let conflict: { archived: boolean } | null = null;

  // 冲突最多再绕一圈（归档云端那份 → 用新基线重推）；还冲突就留着 dirty 下次再来
  for (let round = 0; round <= 1; round++) {
    const res = await putMirror(
      id,
      { ...payload, ...(base ? { baseUpdatedAt: base } : {}) },
      epoch
    );
    // 代际变了（换账号 / 登出清库）：这份结果不属于当前会话，一个字节都不写
    if (!res || !isCurrentEpoch(epoch)) return false;

    if (res.ok) {
      const doc = await res.json().catch(() => null);
      if (!isCurrentEpoch(epoch)) return false;
      // rev 对得上才清 dirty；对不上说明在途期间又改了，那轮编辑还等着推（队列会再跑一轮）
      markMirrorSynced(id, rev, typeof doc?.updatedAt === "string" ? doc.updatedAt : undefined);
      if (conflict) {
        toast(
          conflict.archived
            ? "云端有另一份改动，已存为历史版本，本地内容已覆盖上去"
            : "云端有另一份改动，历史版本没存下来，本地内容已覆盖上去",
          "info"
        );
      }
      return true;
    }

    // 旧服务端不认 baseUpdatedAt，只会直接 200；走到这里的 409 一定是新服务端判出的冲突
    if (res.status !== 409 || round > 0) return false;
    const body = await res.json().catch(() => null);
    const serverUpdatedAt = (body as { doc?: { updatedAt?: unknown } } | null)?.doc?.updatedAt;
    if (!isCurrentEpoch(epoch) || typeof serverUpdatedAt !== "string") return false;
    // 归档失败也继续推：不能让本地这份改动被一个存档请求卡死在本地
    conflict = { archived: await archiveServerVersion(id) };
    if (!isCurrentEpoch(epoch)) return false;
    base = serverUpdatedAt;
    rebaseMirror(id, base);
  }
  return false;
}

/**
 * 推送单篇 dirty 镜像；true = 云端已确认。
 *
 * 自动保存、手动保存、后台同步、联网恢复全走这里。同一篇已有请求在飞时不再开第二个，
 * 只标记「回来再跑一轮」——那一轮读的是最新镜像，合并后的内容一次推上去；
 * 调用方拿到的是同一个 promise，等到的是最后一轮的结果。
 */
export function pushMirrorDoc(id: string): Promise<boolean> {
  // 归属未落定（见 mirrorOwner.SYNC_HOLD_KEY）：镜像里可能是上一个账号的稿子，一个字都不推
  if (isSyncHeld()) return Promise.resolve(false);
  const flying = inFlight.get(id);
  if (flying) {
    flying.again = true;
    return flying.running;
  }
  const entry: PushEntry = { again: false, running: Promise.resolve(false) };
  inFlight.set(id, entry);
  // 一轮推送：意外（镜像写失败等）一律吞成 false，绝不让 reject 冒到调用方——
  // 自动保存那条链路没人接，抛出去就是一条未处理的 rejection
  const round = async () => {
    try {
      return await uploadMirrorDoc(id);
    } catch {
      return false;
    }
  };
  entry.running = (async () => {
    try {
      let result = await round();
      while (entry.again) {
        entry.again = false;
        result = await round();
      }
      return result;
    } finally {
      inFlight.delete(id);
    }
  })();
  return entry.running;
}

/** 未登录期间建的本地文档批量上云，成功一篇删一篇（失败的留待下次）。
 *  只碰浏览器后端：Vault 模式下这些「本地文档」是用户磁盘上的文件，登录不能把它们删掉 */
async function drainLocalDocs(): Promise<number> {
  if (isSyncHeld()) return 0;
  const browser = getBrowserBackend();
  let uploaded = 0;
  const pending = [...browser.listDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  for (const meta of pending) {
    const content = browser.getContent(meta.id);
    if (content === null) continue;
    const epoch = getSessionEpoch();
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // clientKey 用本地 id（local-<uuid>，本来就唯一且稳定）：
        // 响应丢了、下一轮再 POST 一次，服务端按同一个 key 返回同一篇，不会上传出两份
        body: JSON.stringify({
          title: meta.title,
          content,
          category: meta.category,
          clientKey: meta.id,
        }),
      });
      if (!isCurrentEpoch(epoch)) return uploaded;
      if (!res.ok) break;
      const doc = (await res.json()) as ServerDoc;
      if (!isCurrentEpoch(epoch)) return uploaded;
      // 以服务端回的整行为准落镜像：丢过响应再重发时，同一 clientKey 拿回的是
      // 第一次落库那份（可能已经比本地旧），不能拿本地发出去的内容冒充云端版本
      const serverContent = typeof doc.content === "string" ? doc.content : content;
      applyServerDoc({ ...doc, content: serverContent });
      // 与云端那份逐字段比：往返期间用户又改了、或云端存的是更早一次上传，
      // 都把本地最新内容写成 dirty 镜像交给推送队列，再删本地副本，一个字都不丢
      const latestMeta = browser.listDocs().find((d) => d.id === meta.id);
      const latest = browser.getContent(meta.id);
      const changed =
        latest !== null &&
        latestMeta !== undefined &&
        (latest !== serverContent ||
          latestMeta.title !== doc.title ||
          (latestMeta.category ?? UNCATEGORIZED) !== (doc.category ?? UNCATEGORIZED));
      if (changed) {
        try {
          saveMirrorLocal(doc.id, {
            title: latestMeta.title,
            content: latest,
            category: latestMeta.category ?? UNCATEGORIZED,
          });
        } catch {
          continue; // 镜像写不进去（配额满）就先别删本地副本，下一轮重来
        }
      }
      browser.deleteDoc(meta.id);
      uploaded++;
    } catch {
      break;
    }
  }
  return uploaded;
}

/** 推完所有 dirty 镜像；并发有上限，单篇失败不连累其它篇 */
async function pushDirtyMirrors(): Promise<void> {
  const ids = listDirtyMirrorDocs().map((d) => d.id);
  for (let i = 0; i < ids.length; i += PUSH_CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + PUSH_CONCURRENCY).map((id) => pushMirrorDoc(id).catch(() => false))
    );
  }
}

/** 一轮完整同步：先推后拉。并发调用会合并成「跑完再补一轮」 */
export async function syncNow(): Promise<void> {
  if (!online()) return;
  if (syncing) {
    pendingRerun = true;
    return;
  }
  syncing = true;
  const epoch = getSessionEpoch();
  try {
    // 推：dirty 镜像 + 待上云的本地文档
    await pushDirtyMirrors();
    if (!isCurrentEpoch(epoch)) return;
    await drainLocalDocs();
    if (!isCurrentEpoch(epoch)) return;
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
      // 换账号/登出发生在这一趟往返里：整批放弃，别把上一个账号的文章写进新镜像
      if (!isCurrentEpoch(epoch)) return;
      // 游标取服务端 updatedAt 的最大值，不碰本地时钟；同格式 ISO 串可直接字典序比较
      let latest = cursor ?? "";
      let liveIds: Set<string>;
      const incoming: ServerDoc[] = [];
      if (Array.isArray(body)) {
        liveIds = new Set();
        for (const doc of body) {
          liveIds.add(doc.id);
          incoming.push(doc);
          if (doc.updatedAt > latest) latest = doc.updatedAt;
        }
      } else {
        liveIds = new Set(body.ids);
        for (const doc of body.docs) {
          // 软删的只用来推进游标；从镜像移除交给下面的 reconcile（dirty 的会被保住）
          if (!doc.deletedAt) incoming.push(doc);
          if (doc.updatedAt > latest) latest = doc.updatedAt;
        }
      }
      // 整批一次落库：几百篇也只动一次索引、只广播一次
      applyServerDocs(incoming);
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
