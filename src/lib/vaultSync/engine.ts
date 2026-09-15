"use client";

/**
 * 本地文件夹 ↔ 云端的同步引擎。
 *
 * 登录后 Vault 从界面上脱钩（列表/编辑器/回收站/图床全按云端模式走），它只剩一个身份：
 * 一个「同步文件夹」—— 本地文件是真相，云端是自动备份 + 多端镜像。所以这里从不提问、
 * 不打断、不丢内容：冲突把云端那版另存成「xxx (云端副本).md」，离线就攒着，下次接着跑。
 *
 * 一轮的步骤：A 解析映射 → B 逐篇比对 → C 本地新文件上云 → D 云端新文档下载 →
 * E 删除对齐 → F 收尾（落索引、踢 syncNow、更新状态）。
 * 触发：SYNC_DONE（镜像刚跟服务端对过账，最靠得住的时机）、DOCS_CHANGED（去抖 1s）、
 * 网络恢复、开关变动，以及磁盘对账后由外部调 requestVaultSync。
 * 同一时间只跑一轮（in-flight 锁 + rerun 标记，与 sync.ts 同款）。
 */

import { listMirrorDocs } from "@/lib/docStore";
import { hash53 } from "@/lib/hash";
import type { LocalDocMeta } from "@/lib/localBackend";
import { getSyncVault } from "@/lib/localBackend/vaultSession";
import { DOCS_CHANGED_EVENT, isLocalId, notifyDocsChanged } from "@/lib/localDocs";
import { syncNow, SYNC_DONE_EVENT } from "@/lib/sync";
import { syncMappedDoc } from "./compare";
import { loadSyncIndex, noteError, resetSyncIndexCache, saveSyncIndex, type SyncRun } from "./index";
import { resolveMappings } from "./mapping";
import {
  isVaultAutoSyncEnabled,
  resetVaultSyncState,
  setVaultSyncState,
  VAULT_SYNC_SETTING_EVENT,
} from "./state";
import { alignDeletions, pullNewCloudDocs, pushNewLocalDocs } from "./transfer";

/** 本机改动的去抖：连着敲键会连发 DOCS_CHANGED，合成一次 */
const DEBOUNCE_MS = 1000;

let userId = "";
/** 本次登录后收到过 SYNC_DONE 了吗：镜像跟服务端对过账才敢按「云端已删」处理缺失的文档 */
let syncedThisSession = false;
let running = false;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 会话内 云端 id → vault id */
const links = new Map<string, string>();
/** 正文哈希缓存：内容没变就复用上次的结果 */
const hashes = new Map<string, { content: string; hash: string }>();
/** 跨轮累计（会话级），界面上显示「这次会话出过几个副本 / 几张图没传上去」 */
let conflictsTotal = 0;
let mediaFailedTotal = 0;

function hashOf(key: string, content: string): string {
  const hit = hashes.get(key);
  if (hit && hit.content === content) return hit.hash;
  const hash = hash53(content);
  hashes.set(key, { content, hash });
  return hash;
}

const online = (): boolean => typeof navigator === "undefined" || navigator.onLine;

/** 挂上各路触发器，返回卸载函数 */
export function startVaultSync(id: string): () => void {
  if (userId && userId !== id) resetVaultSyncSession(); // 换账号：上一份记忆一概不能用
  userId = id;
  const onSyncDone = () => {
    syncedThisSession = true;
    void tick();
  };
  const onDocsChanged = () => requestVaultSync();
  const onOnline = () => void tick();
  const onSetting = () => {
    if (isVaultAutoSyncEnabled()) void tick();
    else setVaultSyncState({ phase: "off" });
  };
  window.addEventListener(SYNC_DONE_EVENT, onSyncDone);
  window.addEventListener(DOCS_CHANGED_EVENT, onDocsChanged);
  window.addEventListener("online", onOnline);
  window.addEventListener(VAULT_SYNC_SETTING_EVENT, onSetting);
  setVaultSyncState(isVaultAutoSyncEnabled() ? { phase: "idle" } : { phase: "off" });
  // 引擎只在 SYNC_DONE 之后才敢动手；库可能是登录之后才开的，主动踢一把别干等下次回前台
  if (online()) void syncNow();
  return () => {
    window.removeEventListener(SYNC_DONE_EVENT, onSyncDone);
    window.removeEventListener(DOCS_CHANGED_EVENT, onDocsChanged);
    window.removeEventListener("online", onOnline);
    window.removeEventListener(VAULT_SYNC_SETTING_EVENT, onSetting);
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/** 外部触发（如磁盘对账之后）：走去抖，不会把连着来的事件跑成好几轮 */
export function requestVaultSync(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void tick();
  }, DEBOUNCE_MS);
}

/** 登出 / 关库：把这个账号这个库的记忆全部忘掉 */
export function resetVaultSyncSession(): void {
  resetSyncIndexCache();
  links.clear();
  hashes.clear();
  syncedThisSession = false;
  conflictsTotal = 0;
  mediaFailedTotal = 0;
  userId = "";
  resetVaultSyncState();
}

async function tick(): Promise<void> {
  if (running) {
    rerun = true; // 这一轮看到的可能已是旧状态，跑完再补一轮
    return;
  }
  running = true;
  try {
    await runVaultSync();
  } catch (e) {
    setVaultSyncState({ phase: "error", error: (e as Error).message });
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      void tick();
    }
  }
}

async function runVaultSync(): Promise<void> {
  const vault = getSyncVault();
  if (!vault || !userId) return;
  if (!isVaultAutoSyncEnabled()) {
    setVaultSyncState({ phase: "off" });
    return;
  }
  // 还没跟服务端对过账：此刻镜像里缺的文档不代表云端删了，先别动手
  // （开关刚从关切回开也会走到这，别让状态点一直停在「已暂停」）
  if (!syncedThisSession) {
    setVaultSyncState({ phase: "idle" });
    return;
  }
  const idx = await loadSyncIndex(vault, userId);
  setVaultSyncState({ phase: "syncing", error: null });
  const run: SyncRun = {
    vault,
    idx,
    online: online(),
    links,
    hashOf,
    pending: 0,
    conflicts: 0,
    mediaFailed: 0,
    dirtyIndex: false,
    needPush: false,
    listChanged: false,
    error: null,
  };

  const locals = vault.listDocs();
  const localById = new Map<string, LocalDocMeta>(locals.map((m) => [m.id, m]));
  const mirrors = listMirrorDocs().filter((m) => !isLocalId(m.id));
  const map = resolveMappings(run, locals, mirrors);

  for (const pair of map.pairs) {
    const meta = localById.get(pair.vaultId);
    if (!meta) continue;
    try {
      await syncMappedDoc(run, pair, meta);
    } catch (e) {
      noteError(run, e);
    }
  }
  // C 步会把推上去的从 unmappedLocal 里摘掉，D 步判「同名的另一篇」要按 C 之前的快照
  const strangers = new Set(map.unmappedLocal);
  await pushNewLocalDocs(run, map, localById);
  await pullNewCloudDocs(run, map, strangers);
  await alignDeletions(run, map);
  finish(run);
}

/** F 收尾：索引落盘、列表刷新、需要的话踢一把 syncNow，最后把状态说清楚 */
function finish(run: SyncRun): void {
  if (run.dirtyIndex) saveSyncIndex(run.vault, run.idx);
  if (run.listChanged) notifyDocsChanged();
  // syncNow 跑完会再发 SYNC_DONE，引擎重跑一轮 —— 那一轮应当是稳态、什么都不做
  if (run.needPush && run.online) void syncNow();
  conflictsTotal += run.conflicts;
  mediaFailedTotal += run.mediaFailed;
  const counts = {
    pending: run.pending,
    conflicts: conflictsTotal,
    mediaFailed: mediaFailedTotal,
  };
  if (run.error) {
    setVaultSyncState({ ...counts, phase: "error", error: run.error });
    return;
  }
  if (!run.online) {
    setVaultSyncState({ ...counts, phase: "offline", error: null });
    return;
  }
  // 还有没落定的（离线攒的、推失败的、编辑器里正在改的）就还算在同步中
  if (run.pending > 0) {
    setVaultSyncState({ ...counts, phase: "syncing", error: null });
    return;
  }
  setVaultSyncState({
    ...counts,
    phase: "synced",
    error: null,
    lastSyncAt: new Date().toISOString(),
  });
}
