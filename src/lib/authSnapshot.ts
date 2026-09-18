/**
 * 本地账号快照：断网或服务器够不着时 next-auth 拿不到会话，靠它在本机记住「我是谁」，
 * 好让离线也能留在自己账号下继续编辑，账号行也有名字和头像可渲染。
 * 只存展示用的身份字段，不含任何凭证——鉴权永远在服务端，这份快照说了不算。
 *
 * 它只回答「本机这份登录态还算数吗」。「本机镜像是谁的」是另一回事，在 lib/mirrorOwner：
 * 快照会因为过期、被探测判定登出而清掉，归属不能跟着一起没——否则下一个账号登进来
 * 就把上一个人没推上去的草稿当自己的了。
 */

import { mirrorOwnedBy } from "./mirrorOwner";

/** 快照里的账号信息，字段与 session.user 对得上，UI 两边通用 */
export interface AuthSnapshotUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface AuthSnapshot extends AuthSnapshotUser {
  /** 最近一次被服务器确认登录的时刻（ms）；每次在线确认都往后推 */
  confirmedAt: number;
}

/** 导出给多标签监听用：别的标签写/清这个 key，说明那边登录态变了 */
export const AUTH_SNAPSHOT_KEY = "xedit-auth-user";
/**
 * 老版本只存过一个布尔标志，没有账号信息。仍然照写：首屏那段内联脚本
 * （src/app/layout.tsx 的 THEME_INIT_SCRIPT、public/theme-init.js）按它打 data-ws，
 * 在 React 之前就用 CSS 盖住落地页。老用户没有快照时它还兼作「曾登录」的兜底。
 */
const LEGACY_KEY = "xedit-was-authed";

/** 与 auth.ts 的 session.maxAge 对齐：本地这份也一年过期 */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * 每次渲染都 JSON.parse 会产出新对象，auth.user 的引用就跟着每帧变，
 * 下游的 memo 全白做。缓存一份，写入/清除时作废。
 */
let cached: AuthSnapshot | null | undefined;

/** 读一次存一次。这条路径在渲染期间跑，localStorage 抛异常也不能把页面带塌 */
function load(): AuthSnapshot | null {
  if (typeof window === "undefined") return null;
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const raw = localStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (raw === null) return cached;
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && typeof (v as AuthSnapshot).confirmedAt === "number") {
      cached = v as AuthSnapshot;
    } else {
      // 脏数据直接丢掉，好让老标志还能接着兜底
      localStorage.removeItem(AUTH_SNAPSHOT_KEY);
    }
  } catch {
    // 解析失败或存储不可用：当作没有快照
  }
  return cached;
}

/** 快照是否还在有效期内。时钟被调快调慢都只影响这一判断，不至于误清数据 */
function fresh(snap: AuthSnapshot): boolean {
  return Date.now() - snap.confirmedAt < MAX_AGE_MS;
}

/** 有效期内的账号快照；过期或没有就是 null */
export function readAuthSnapshot(): AuthSnapshot | null {
  const snap = load();
  return snap && fresh(snap) ? snap : null;
}

/**
 * 不看有效期的原样读取。只给 mirrorOwner 的一次性迁移用：
 * 「这份镜像是谁建的」跟快照过没过期无关，过期的快照照样指得出人。
 */
export function peekAuthSnapshot(): AuthSnapshot | null {
  return load();
}

/**
 * 这个账号跟本机镜像是不是同一个人。
 * @deprecated 归属判断已经搬到 lib/mirrorOwner，这里只留个转发免得老调用点静默走错分支。
 * 新代码直接用 `mirrorOwnedBy()`：它把「认不出来」单独分成 unknown，不再一律当同一个人。
 */
export function isSameAuthUser(user: AuthSnapshotUser): boolean {
  return mirrorOwnedBy(user) !== "different";
}

/**
 * 服务器确认登录后记一笔。confirmedAt 每次都往后推，等于本地这份也滑动续期。
 * 它不负责记归属——镜像归谁由 mirrorOwner.setMirrorOwner 单独写。
 */
export function saveAuthSnapshot(user: AuthSnapshotUser) {
  const snap: AuthSnapshot = {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    confirmedAt: Date.now(),
  };
  cached = snap;
  try {
    localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snap));
    localStorage.setItem(LEGACY_KEY, "1");
  } catch {
    // 隐私模式下 localStorage 会抛：这次会话仍能用，只是下次进来认不出账号
  }
}

/** 清掉本机登录态。镜像归属记录（mirrorOwner）不在这里清：缓存还在，它就还是那个人的 */
export function clearAuthSnapshot() {
  cached = null;
  try {
    localStorage.removeItem(AUTH_SNAPSHOT_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // 同上，清不掉也没别的办法
  }
}

/**
 * 「本机曾经登录过」。有快照就以快照为准（过期即作废），
 * 老用户还没升级出快照时才认那个旧布尔标志——首次在线确认后就换成快照了。
 */
export function wasAuthed(): boolean {
  if (typeof window === "undefined") return false;
  const snap = load();
  if (snap) return fresh(snap);
  try {
    return localStorage.getItem(LEGACY_KEY) === "1";
  } catch {
    return false;
  }
}
