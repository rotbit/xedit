/**
 * 「服务器到底还认不认我」的探测。
 *
 * next-auth 的客户端拿不到会话时一律报 unauthenticated：断网、反代挂了、服务端 500,
 * 与「真的登出了」在它眼里没有区别（node_modules/next-auth/lib/client.js 的 fetchData
 * 对 fetch reject 和非 2xx 都返回 null）。于是我们自己打一次 /api/auth/session——
 * 只有服务器明确回了「没有会话」才算登出，拿不到答案一律按离线处理，
 * 本地登录态继续有效，用户照旧在自己账号下编辑。
 *
 * 状态是模块级单例：多处用同一份结论，同一时刻也只跑一个探测。
 */

import { getSession } from "next-auth/react";
import { toast } from "@/components/Toast";
import { clearAuthSnapshot } from "./authSnapshot";

export type ProbeState =
  /** 还没有结论（首探未回，或探到服务器不可达）：乐观当作仍然登录 */
  | "pending"
  /** 服务器说会话还在，正等 next-auth 的 provider 跟上 */
  | "reachable"
  /** 服务器明确回了「没有会话」——这才是真的登出 */
  | "signed-out";

/** 探不到就退避重试：首轮 15s，翻倍到 2min 封顶 */
const FIRST_RETRY_MS = 15_000;
const MAX_RETRY_MS = 120_000;
/** 回前台、网络恢复会连着触发，这段时间里只探一次 */
const MIN_GAP_MS = 3_000;

let state: ProbeState = "pending";
const listeners = new Set<() => void>();
/** 在用的订阅方数量，归零就收摊（StrictMode 会挂-卸-挂一轮，靠它不误关） */
let users = 0;
let inFlight = false;
let lastProbeAt = 0;
let retryMs = FIRST_RETRY_MS;
let timer: ReturnType<typeof setTimeout> | null = null;

function setState(next: ProbeState) {
  if (state === next) return;
  state = next;
  for (const cb of listeners) cb();
}

export function subscribeProbe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getProbeState(): ProbeState {
  return state;
}

/** 服务端没有探测这回事，给客户端首帧同一个值，免得 hydration 对不上 */
export function getProbeServerState(): ProbeState {
  return "pending";
}

function clearTimer() {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

function scheduleRetry() {
  clearTimer();
  if (users === 0) return;
  const delay = retryMs;
  retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  timer = setTimeout(() => {
    timer = null;
    void probe();
  }, delay);
}

/** 探一次，结论只有 ProbeState 那三种 */
async function probe(): Promise<void> {
  if (users === 0 || inFlight) return;
  // 浏览器自己都说断网了，这一趟必然失败，省掉（控制台也少一片红）
  if (!navigator.onLine) {
    scheduleRetry();
    return;
  }
  inFlight = true;
  lastProbeAt = Date.now();
  try {
    const res = await fetch("/api/auth/session", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      scheduleRetry(); // 服务端异常不是「没有会话」，保持现状
      return;
    }
    // 认证门户、反代可能拿 200 回一页 HTML，那不是答案：
    // 解析不出 JSON 就走下面的 catch 当不可达，绝不能据此把人判成已登出
    const body: unknown = await res.json();
    const user = body && typeof body === "object" ? (body as { user?: unknown }).user : null;
    if (user) {
      // 会话其实好好的，是 next-auth 那次拉取瞬时失败了。getSession() 会广播一条消息，
      // SessionProvider 收到后自己重拉，status 就回到 authenticated（不走 update()：
      // 它会把 status 打回 loading，整个工作台要闪一下）
      setState("reachable");
      await getSession();
      scheduleRetry(); // provider 万一没跟上，过一会儿再推一次
      return;
    }
    // 服务器明确说没有会话：这才清本地登录态。
    // 镜像不清——里面可能还有没推上去的改动，换账号由 useAuthMode 的 id 比对兜底
    clearTimer();
    clearAuthSnapshot();
    setState("signed-out");
    toast("登录已过期，请重新登录", "info");
  } catch {
    scheduleRetry(); // 网络层失败 / 响应不是 JSON：服务器够不着
  } finally {
    inFlight = false;
  }
}

/** 网络回来了、页面回到前台：退避重新从头算，立刻再探一次 */
function wake() {
  if (state === "signed-out") return;
  if (Date.now() - lastProbeAt < MIN_GAP_MS) return;
  retryMs = FIRST_RETRY_MS;
  clearTimer();
  void probe();
}

const onOnline = () => wake();
const onVisible = () => {
  if (document.visibilityState === "visible") wake();
};

/** 开始探测（重复调用只会真正启动一次），返回停止函数 */
export function startProbing(): () => void {
  users++;
  if (users === 1) {
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void probe();
  }
  return () => {
    users--;
    if (users > 0) return;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    clearTimer();
    retryMs = FIRST_RETRY_MS;
    lastProbeAt = 0;
    setState("pending");
  };
}
