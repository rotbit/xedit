/**
 * 镜像归属：本机这份云端镜像到底是谁的。
 *
 * 原先这件事挂在账号快照上（authSnapshot.isSameAuthUser），可快照同时背着两件事——
 * 「本机登录还有效吗」和「缓存属于谁」。探测判定登出会清快照，归属跟着一起没了，
 * 下一个账号登进来就把上一个人的缓存直接认领走。拆出来之后：
 * - 快照只管登录有效性，过期/被判登出就清；
 * - 归属记录只在换账号、登出时动，别的路径一概不碰。
 *
 * 只存 id / email 两个识别字段，没有名字头像那些展示用的东西——它不是第二份快照。
 */

import { peekAuthSnapshot, type AuthSnapshotUser } from "./authSnapshot";

/** 本机镜像归属记录。id 与 email 至少有一个，全空的记录等于没记 */
export interface MirrorOwner {
  id?: string;
  email?: string;
}

/**
 * 当前账号与本机镜像的关系：
 * - same：同一个人，缓存照用
 * - different：确定换人了，上一个人的东西必须先挪走再清
 * - unknown：认不出来（没记录、或两边拿不出可比的同类字段）。既不清也不认领——
 *   宁可把未同步的草稿搁进孤儿列表，也不能猜错一次就删了人家的稿子
 */
export type MirrorOwnership = "same" | "different" | "unknown";

export const MIRROR_OWNER_KEY = "xedit-mirror-owner";
/**
 * 推送闸门。换账号时旧主人的未同步草稿没能挪进孤儿列表（配额满），镜像只好原样留着，
 * 但此时 cookie 已经是新账号的：这些 dirty 篇绝不能被同步引擎用新账号推上去。
 * 落一个标记让 sync 在归属落定前一律不推，下次登录归属落定时再解开。
 */
export const SYNC_HOLD_KEY = "xedit-sync-hold";

export function isSyncHeld(): boolean {
  try {
    return localStorage.getItem(SYNC_HOLD_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSyncHold(held: boolean) {
  try {
    if (held) localStorage.setItem(SYNC_HOLD_KEY, "1");
    else localStorage.removeItem(SYNC_HOLD_KEY);
  } catch {
    // 连一个字节都写不进去：闸门写不上，只能靠调用方的 toast 提醒
  }
}

/** 从任意账号对象里择出识别字段；两样都没有就当认不出这个人 */
export function toMirrorOwner(
  user: AuthSnapshotUser | MirrorOwner | null | undefined
): MirrorOwner | null {
  if (!user) return null;
  const id = typeof user.id === "string" && user.id ? user.id : undefined;
  const email = typeof user.email === "string" && user.email ? user.email : undefined;
  return id || email ? { id, email } : null;
}

/** 解析存下来的那份记录，顺手把脏数据丢掉 */
function readRaw(): MirrorOwner | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MIRROR_OWNER_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    const owner = v && typeof v === "object" ? toMirrorOwner(v as MirrorOwner) : null;
    if (owner) return owner;
    localStorage.removeItem(MIRROR_OWNER_KEY);
  } catch {
    // 解析失败或存储不可用：当作没记过
  }
  return null;
}

/**
 * 本机镜像的归属。老版本升级上来没有这条记录，但有账号快照——
 * 那份镜像就是快照里那个人建的，一次性补写进来（用 peek：过期与否都算数，
 * 归属跟有效期无关）。补不出来才是真的 unknown。
 */
export function readMirrorOwner(): MirrorOwner | null {
  const own = readRaw();
  if (own) return own;
  const migrated = toMirrorOwner(peekAuthSnapshot());
  if (migrated) setMirrorOwner(migrated);
  return migrated;
}

/** 记下这份镜像归谁。换账号清完镜像、首次登录建镜像时调 */
export function setMirrorOwner(user: AuthSnapshotUser | MirrorOwner) {
  const owner = toMirrorOwner(user);
  if (!owner) return;
  try {
    localStorage.setItem(MIRROR_OWNER_KEY, JSON.stringify(owner));
  } catch {
    // 隐私模式下写不进去：这次会话照常，下次进来归属变 unknown（保守路径，不会误删）
  }
}

/** 登出时清掉：镜像已经不在了，归属自然也不该留 */
export function clearMirrorOwner() {
  try {
    localStorage.removeItem(MIRROR_OWNER_KEY);
  } catch {
    // 清不掉也没别的办法
  }
}

/** 两份归属记录是不是同一个人。有 id 比 id，否则比 email；比不了就不是「确定同一个」 */
export function sameOwner(a: MirrorOwner | null, b: MirrorOwner | null): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  if (a.email && b.email) return a.email === b.email;
  return false;
}

/** 这个账号跟本机镜像的关系。判不出同异一律 unknown，交给调用方走保守路径 */
export function mirrorOwnedBy(user: AuthSnapshotUser | MirrorOwner): MirrorOwnership {
  const prev = readMirrorOwner();
  const next = toMirrorOwner(user);
  if (!prev || !next) return "unknown";
  if (prev.id && next.id) return prev.id === next.id ? "same" : "different";
  if (prev.email && next.email) return prev.email === next.email ? "same" : "different";
  // 记录里只有邮箱、这次只拿到 id（或反过来）：没有可比字段，不猜
  return "unknown";
}
