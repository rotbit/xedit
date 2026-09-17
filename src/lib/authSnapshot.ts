/**
 * 本地账号快照：断网或服务器够不着时 next-auth 拿不到会话，靠它在本机记住「我是谁」，
 * 好让离线也能留在自己账号下继续编辑，账号行也有名字和头像可渲染。
 * 只存展示用的身份字段，不含任何凭证——鉴权永远在服务端，这份快照说了不算。
 */

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

const SNAPSHOT_KEY = "xedit-auth-user";
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
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw === null) return cached;
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && typeof (v as AuthSnapshot).confirmedAt === "number") {
      cached = v as AuthSnapshot;
    } else {
      // 脏数据直接丢掉，好让老标志还能接着兜底
      localStorage.removeItem(SNAPSHOT_KEY);
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
 * 这个账号跟本机记着的是不是同一个。过没过期都要比——换账号跟有效期无关。
 * 两边都有 id 才按 id 比，缺了退回邮箱；都认不出来就当同一个人：
 * 宁可漏清一次镜像，也不能因为认不出来就把人家没推上去的改动删了。
 */
export function isSameAuthUser(user: AuthSnapshotUser): boolean {
  const prev = load();
  if (!prev) return true; // 没记过就谈不上换人（老用户升级上来就是这条）
  if (prev.id && user.id) return prev.id === user.id;
  if (prev.email && user.email) return prev.email === user.email;
  return true;
}

/** 服务器确认登录后记一笔。confirmedAt 每次都往后推，等于本地这份也滑动续期 */
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
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    localStorage.setItem(LEGACY_KEY, "1");
  } catch {
    // 隐私模式下 localStorage 会抛：这次会话仍能用，只是下次进来认不出账号
  }
}

export function clearAuthSnapshot() {
  cached = null;
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
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
