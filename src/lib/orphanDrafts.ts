/**
 * 孤儿草稿：换账号、登出时从镜像里抢救出来的「还没推上云」的稿子。
 *
 * 以前换账号直接 clearMirror()，上一个账号 dirty 的文章连同正文一起没了——
 * 那些内容云端从来没见过，删掉就是真的没了。现在先把它们连同归属挪进
 * localStorage 的 `xedit-orphan-drafts`，镜像再清：
 * - 原主人下次登录（reclaimOrphanDrafts）自动写回镜像并标 dirty，由同步引擎推上去；
 * - 归属不明的（老版本升级、快照被探测清过）记成 `{ unknown: true }` 一直躺着，
 *   不认领、不上传、也不删，等以后做找回入口；
 * - 孤儿列表在自己的 key 里，sync 只认镜像索引，永远不会把别人的草稿推到当前账号名下。
 */

import {
  clearMirror,
  getMirrorContent,
  listDirtyMirrorDocs,
  saveMirrorLocal,
  type MirrorMeta,
} from "./docStore";
import { saveAuthSnapshot, type AuthSnapshotUser } from "./authSnapshot";
import {
  clearMirrorOwner,
  mirrorOwnedBy,
  readMirrorOwner,
  sameOwner,
  setMirrorOwner,
  toMirrorOwner,
  type MirrorOwner,
  type MirrorOwnership,
  setSyncHold,
} from "./mirrorOwner";
import { bumpSessionEpoch } from "./sessionEpoch";

export const ORPHAN_DRAFTS_KEY = "xedit-orphan-drafts";

/** 攒太多会把配额吃光，超出就丢最早的那批（它们多半早就没人要了） */
const MAX_ORPHANS = 200;

/** 这篇草稿是谁的；认不出来就是 { unknown: true }，任何账号都别想认领 */
export type OrphanOwner = MirrorOwner | { unknown: true };

export interface OrphanDraft {
  id: string;
  title: string;
  category?: string;
  /** 正文。镜像只拉到元数据（只改过标题/分类）时会缺，写回时就只补元数据 */
  content?: string;
  updatedAt: string;
  /** 挪走那一刻镜像的 rev，只作存档留痕；写回镜像时由 saveMirrorLocal 自己重新起版本 */
  rev?: number;
  owner: OrphanOwner;
  /** 挪进来的时刻（ms），只用于排序和以后的找回界面 */
  stashedAt: number;
}

export interface StashResult {
  /** 草稿是不是都安全落袋。false 时调用方必须跳过清镜像 */
  ok: boolean;
  count: number;
}

function isUnknownOwner(owner: OrphanOwner): owner is { unknown: true } {
  return "unknown" in owner && owner.unknown === true;
}

function readList(): OrphanDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ORPHAN_DRAFTS_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter(
      (d): d is OrphanDraft =>
        !!d && typeof d === "object" && typeof d.id === "string" && !!d.owner
    );
  } catch {
    return [];
  }
}

/** 写回整份列表。配额满会抛，交给调用方决定要不要继续往下清 */
function writeList(list: OrphanDraft[]) {
  const kept = list.length > MAX_ORPHANS ? list.slice(list.length - MAX_ORPHANS) : list;
  localStorage.setItem(ORPHAN_DRAFTS_KEY, JSON.stringify(kept));
}

/** 全部孤儿草稿，按挪进来的先后。留给以后的找回界面用 */
export function listOrphanDrafts(): OrphanDraft[] {
  return readList().sort((a, b) => a.stashedAt - b.stashedAt);
}

function toDraft(meta: MirrorMeta, owner: OrphanOwner): OrphanDraft {
  const content = getMirrorContent(meta.id);
  return {
    id: meta.id,
    title: meta.title,
    ...(meta.category === undefined ? {} : { category: meta.category }),
    ...(content === null ? {} : { content }),
    updatedAt: meta.updatedAt,
    ...(typeof meta.rev === "number" ? { rev: meta.rev } : {}),
    owner,
    stashedAt: Date.now(),
  };
}

/**
 * 把镜像里所有 dirty（未同步）的文章连同归属挪进孤儿列表。**清镜像之前必须先调它**。
 * owner 传 null 表示归属不明，记成 unknown。
 * 返回 ok=false 只有一种情况：写不进去（配额满/隐私模式）——那就别清镜像了，
 * 稿子留在原地总好过凭空消失。
 */
export function stashOrphanDrafts(owner: MirrorOwner | null): StashResult {
  const dirty = listDirtyMirrorDocs();
  if (dirty.length === 0) return { ok: true, count: 0 };
  const group: OrphanOwner = owner ?? { unknown: true };
  const ids = new Set(dirty.map((d) => d.id));
  // 同一个人的同一篇再次挪进来：以新的为准，别攒出两份
  const kept = readList().filter((d) => !(ids.has(d.id) && sameGroup(d.owner, group)));
  try {
    writeList([...kept, ...dirty.map((meta) => toDraft(meta, group))]);
    return { ok: true, count: dirty.length };
  } catch {
    return { ok: false, count: 0 };
  }
}

/** 两条记录算不算同一组归属。unknown 只和 unknown 同组，且永远匹配不上任何真实账号 */
function sameGroup(a: OrphanOwner, b: OrphanOwner): boolean {
  if (isUnknownOwner(a) || isUnknownOwner(b)) return isUnknownOwner(a) && isUnknownOwner(b);
  return sameOwner(a, b);
}

/**
 * 当前账号把自己那批草稿领回镜像（标 dirty，同步引擎随后推上云），返回领回的篇数。
 * 认不出归属的那些一篇都不动。
 */
export function reclaimOrphanDrafts(user: AuthSnapshotUser | MirrorOwner): number {
  const me = toMirrorOwner(user);
  if (!me) return 0;
  const list = readList();
  const mine = list.filter((d) => !isUnknownOwner(d.owner) && sameOwner(d.owner, me));
  if (mine.length === 0) return 0;
  for (const d of mine) {
    saveMirrorLocal(d.id, {
      title: d.title,
      ...(d.content === undefined ? {} : { content: d.content }),
      ...(d.category === undefined ? {} : { category: d.category }),
    });
  }
  const reclaimed = new Set(mine);
  try {
    writeList(list.filter((d) => !reclaimed.has(d)));
  } catch {
    // 列表清不掉无所谓：写回镜像是幂等的，下次登录顶多再覆盖一遍同样的内容
  }
  return mine.length;
}

export interface AccountSwitchResult {
  ownership: MirrorOwnership;
  /** 挪进孤儿列表的篇数 */
  stashed: number;
  /** 从孤儿列表领回镜像的篇数 */
  reclaimed: number;
  /** 镜像是否被清空 */
  cleared: boolean;
  /** 有未同步草稿但存不下：这次保留镜像不清，调用方该提示用户 */
  stashFailed: boolean;
}

/**
 * 登录确认后落定「这份镜像归谁」，是 useAuthMode 那个 effect 的全部逻辑。
 * 抽成普通函数是为了能直接测：它只碰 localStorage，不需要 React。
 *
 * 三条路：同一个人照用并领回自己的草稿；换了人先挪走旧草稿再清；
 * 认不出来就把 dirty 的挪成 unknown 组，剩下的（都是云端副本）清掉重拉。
 */
export function resolveAccountSwitch(user: AuthSnapshotUser): AccountSwitchResult {
  const ownership = mirrorOwnedBy(user);
  const base = { ownership, stashed: 0, reclaimed: 0, cleared: false, stashFailed: false };

  if (ownership === "same") {
    setSyncHold(false);
    saveAuthSnapshot(user);
    return { ...base, reclaimed: reclaimOrphanDrafts(user) };
  }

  // different：换人了，旧主人的草稿先落袋；unknown：谁的都说不准，一律记成 unknown 组
  const prevOwner = ownership === "different" ? readMirrorOwner() : null;
  const stash = stashOrphanDrafts(prevOwner);
  if (!stash.ok) {
    // 存不下就什么都别动：镜像原样留着，归属还是上一个人，下次登录再试。
    // 但同步引擎要停：cookie 已是新账号，旧主人的 dirty 篇推上去就串号了
    setSyncHold(true);
    return { ...base, stashFailed: true };
  }
  setSyncHold(false);

  // unknown 且镜像里没有未同步内容时，剩下的全是云端副本：留着也不会丢东西，
  // 随后的同步会按服务端列表对账（reconcileMirror）把不属于这个账号的清掉。
  // 但归属得当场认下来，否则每次登录都要重走一遍这条保守路径
  if (ownership === "different" || stash.count > 0) {
    clearMirror(); // 会连账号快照一起清，所以 saveAuthSnapshot 必须排在它后面
    bumpSessionEpoch(); // 上一个账号的在途请求回来时就作废了
  }
  setMirrorOwner(user);
  saveAuthSnapshot(user);
  return {
    ...base,
    stashed: stash.count,
    cleared: ownership === "different" || stash.count > 0,
    reclaimed: reclaimOrphanDrafts(user),
  };
}

/**
 * 登出前的交接：未同步草稿挪进孤儿列表，再清镜像和归属。
 * 返回 false = 草稿没存下，镜像保持原样（调用方提示一句，别默默把稿子带走）。
 */
export function stashAndDetachMirror(): boolean {
  const stash = stashOrphanDrafts(readMirrorOwner());
  if (!stash.ok) return false;
  clearMirror();
  clearMirrorOwner();
  bumpSessionEpoch();
  return true;
}
