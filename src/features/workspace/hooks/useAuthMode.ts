"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSession, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  AUTH_SNAPSHOT_KEY,
  readAuthSnapshot,
  wasAuthed,
  type AuthSnapshot,
} from "@/lib/authSnapshot";
import { MIRROR_OWNER_KEY, sameOwner, toMirrorOwner } from "@/lib/mirrorOwner";
import { resolveAccountSwitch } from "@/lib/orphanDrafts";
import { bumpSessionEpoch } from "@/lib/sessionEpoch";
import { notifyDocsChanged } from "@/lib/localDocs";
import { toast } from "@/components/Toast";
import {
  getProbeServerState,
  getProbeState,
  startProbing,
  subscribeProbe,
} from "@/lib/sessionProbe";
import { useOnline } from "@/hooks/useOnline";

/** 渲染账号那一行用：在线拿会话，离线拿本地快照，两者字段对得上 */
export type AuthUser = Session["user"] | AuthSnapshot;

/** 另一个标签页写进来的账号快照 / 归属记录里，识别字段长什么样 */
function identityOf(raw: string | null) {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? toMirrorOwner(v as { id?: string; email?: string }) : null;
  } catch {
    return null;
  }
}

/**
 * 工作台的三种运行模式：
 * - loggedIn：正常云端模式
 * - offlineAuthed：本机登录态仍然有效，但服务器暂时够不着（断网、反代挂了、VPN 断了），
 *   一切照常落本地镜像，联网后自动补同步
 * - localMode：未登录，数据存在浏览器本地（Obsidian 式本地优先）
 *
 * 判定原则只有一条：**只有服务器明确回了「没有会话」才算登出**。next-auth 客户端
 * 对网络失败和真登出给的都是 unauthenticated，信它就会一断网就掉回游客模式，
 * 所以这里额外跑一个探测（lib/sessionProbe），没有结论期间一律保持登录态。
 */
export function useAuthMode() {
  const { data: session, status } = useSession();
  const navigatorOnline = useOnline();
  const probe = useSyncExternalStore(subscribeProbe, getProbeState, getProbeServerState);

  const loggedIn = status === "authenticated";
  // 本机记得自己登录过：此刻的 unauthenticated 很可能只是「问不到答案」
  const authedBefore = status === "unauthenticated" && wasAuthed();
  const offlineAuthed = authedBefore && probe !== "signed-out";
  const localMode = status === "unauthenticated" && !offlineAuthed;

  const user = session?.user;
  const userId = user?.id;
  const userEmail = user?.email;

  // 每确认一次登录就落定一次「本机这份镜像归谁」：同一个人续快照、领回上次没推上去的草稿；
  // 换了人（另一个标签页登进别人、cookie 被换掉，没经过登出）先把旧主人的 dirty 草稿
  // 挪进孤儿列表再清镜像，否则两边文章会串成一堆。
  // 本 effect 排在 useDocLibrary 那几个之前，顺序是成立的
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const r = resolveAccountSwitch(user);
    if (r.stashFailed) {
      toast("上一账号有未同步草稿，本次未清理本地缓存", "info");
      return;
    }
    // 同步派事件时 useDocLibrary 的监听还没挂上（同一轮 effect 里它在后面），推到微任务
    if (r.cleared || r.reclaimed > 0) queueMicrotask(() => notifyDocsChanged());
    if (r.reclaimed > 0) toast(`找回 ${r.reclaimed} 篇上次未同步的草稿，将自动同步`, "success");
  }, [status, user]);

  // 别的标签页登出或换了账号：本标签的 localStorage 已经被改过了，但 React 这边还一无所知。
  // next-auth 自己用 BroadcastChannel 广播 signIn/signOut（node_modules/next-auth/react.js），
  // 会话状态它会重拉；这里补的是本地那摊东西——代际作废掉在途写入，再让列表重读一次。
  // 同一个人只是刷新了 confirmedAt 不算换人，否则每个标签续一次期就白白作废一批在途请求
  useEffect(() => {
    const mine = toMirrorOwner({ id: userId, email: userEmail });
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== AUTH_SNAPSHOT_KEY && e.key !== MIRROR_OWNER_KEY) return;
      if (e.key !== null && e.newValue !== null && sameOwner(identityOf(e.newValue), mine)) return;
      bumpSessionEpoch();
      notifyDocsChanged();
      void getSession(); // 顺带催一把 provider，status 重新落定
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, userEmail]);

  // 拿不到会话又记得自己登录过：自己去探服务器，别听 next-auth 的一面之词
  useEffect(() => {
    if (!authedBefore) return;
    return startProbing();
  }, [authedBefore]);

  return {
    session,
    status,
    /** 浏览器在线「且」服务器够得着：各处据此决定直连云端还是先落本地 */
    online: navigatorOnline && !offlineAuthed,
    loggedIn,
    offlineAuthed,
    localMode,
    /** 当前账号：在线取会话，离线取本地快照（快照带缓存，引用稳定） */
    user: user ?? readAuthSnapshot() ?? undefined,
  };
}

export type AuthMode = ReturnType<typeof useAuthMode>;
