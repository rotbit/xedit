/**
 * 同步索引 `.xedit/sync.json`：磁盘文件 ↔ 云端文档的对应关系，同步引擎的记忆。
 * 每篇记「本地相对路径 + 上次两端一致时的正文哈希」，那个哈希就是三方比对的 base ——
 * 本地变了、云端变了、还是两边都变（冲突）全靠它分辨。附件另记一份「相对路径 → 图床 url」，
 * 同一张图不会每次上云都重传。
 * 换账号登录（userId 不同）或文件读坏 → 整份重置：宁可重新对账，也不拿错的 base 去覆盖内容。
 */

import type { VaultBackend } from "@/lib/localBackend/vaultBackend";

/** 索引里的一篇：本地在哪、上次一致时正文是什么样 */
export interface SyncDocRef {
  relPath: string;
  hash: string;
  /** 上次一致时云端的标题与分类：云端只改了名字/分类（正文没动）也要能察觉，
   *  记的是云端那侧的值（文件名经过清洗/去重可能与它不同，那不算变化） */
  title?: string;
  category?: string;
}

export interface SyncIndex {
  v: 1;
  /** 换账号登录 → 整份重置 */
  userId: string;
  /** key = 云端 id */
  docs: Record<string, SyncDocRef>;
  /** attachments/xxx.png → 图床 url，已传过的附件不重传 */
  images: Record<string, string>;
}

/** 一轮同步的上下文：各步骤只管往上记，收尾统一落索引、发广播、更新状态 */
export interface SyncRun {
  readonly vault: VaultBackend;
  readonly idx: SyncIndex;
  readonly online: boolean;
  /** 会话内 云端 id → vault id：会话内改名 vault id 不变，认领文件优先按它 */
  readonly links: Map<string, string>;
  /** 正文哈希，按 key 缓存（内容没变就复用）：本地用 vault id，云端用 cloud:<云端 id> */
  readonly hashOf: (key: string, content: string) => string;
  /** 还没上云的本地改动数（含离线攒下的） */
  pending: number;
  /** 本轮生成的「(云端副本)」数 */
  conflicts: number;
  /** 本轮上传失败的附件数 */
  mediaFailed: number;
  /** 索引有改动，收尾要写盘 */
  dirtyIndex: boolean;
  /** 有本地改动落进镜像，收尾要踢一把 syncNow */
  needPush: boolean;
  /** 文库列表要刷新 */
  listChanged: boolean;
  /** 第一条异常的说明；单篇出错不中断整轮 */
  error: string | null;
}

const FILE = "sync.json";

/** 索引缓存：同一个库 + 同一个账号才复用（backend 引用本身就是库的身份） */
let cached: { vault: VaultBackend; userId: string; index: SyncIndex } | null = null;

const emptyIndex = (userId: string): SyncIndex => ({ v: 1, userId, docs: {}, images: {} });

/** 读 `.xedit/sync.json`：读不到、坏了、或者是另一个账号的 → 空索引 */
export async function loadSyncIndex(vault: VaultBackend, userId: string): Promise<SyncIndex> {
  if (cached && cached.vault === vault && cached.userId === userId) return cached.index;
  const raw = await vault.readJson(FILE).catch(() => null);
  const index = parseIndex(raw, userId) ?? emptyIndex(userId);
  cached = { vault, userId, index };
  return index;
}

/** 一轮结束且有改动才写（走后端的写队列，界面不等磁盘） */
export function saveSyncIndex(vault: VaultBackend, index: SyncIndex): void {
  vault.writeJson(FILE, index);
}

/** 关库 / 登出时清缓存，下次重新从磁盘读 */
export function resetSyncIndexCache(): void {
  cached = null;
}

/** 建立或更新一条映射 */
export function linkDoc(run: SyncRun, cloudId: string, vaultId: string, ref: SyncDocRef): void {
  run.idx.docs[cloudId] = ref;
  run.links.set(cloudId, vaultId);
  run.dirtyIndex = true;
}

/** 拆掉一条映射：两端之一已经没了 */
export function unlinkDoc(run: SyncRun, cloudId: string): void {
  delete run.idx.docs[cloudId];
  run.links.delete(cloudId);
  run.dirtyIndex = true;
}

/** 单篇出错只记第一条：整轮继续跑，界面用状态点表达 */
export function noteError(run: SyncRun, e: unknown): void {
  run.error ??= (e as Error).message || "同步失败";
}

/** 磁盘上的 JSON 不可信：字段逐个验，验不过的条目丢掉而不是整份作废 */
function parseIndex(raw: unknown, userId: string): SyncIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<SyncIndex>;
  if (o.v !== 1 || o.userId !== userId) return null;
  const docs: Record<string, SyncDocRef> = {};
  for (const [id, ref] of Object.entries(o.docs ?? {})) {
    if (ref && typeof ref.relPath === "string" && typeof ref.hash === "string") {
      docs[id] = { relPath: ref.relPath, hash: ref.hash };
      if (typeof ref.title === "string") docs[id].title = ref.title;
      if (typeof ref.category === "string") docs[id].category = ref.category;
    }
  }
  const images: Record<string, string> = {};
  for (const [rel, url] of Object.entries(o.images ?? {})) {
    if (typeof url === "string") images[rel] = url;
  }
  return { v: 1, userId, docs, images };
}
