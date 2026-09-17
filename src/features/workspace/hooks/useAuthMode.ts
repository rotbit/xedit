"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  isSameAuthUser,
  readAuthSnapshot,
  saveAuthSnapshot,
  wasAuthed,
  type AuthSnapshot,
} from "@/lib/authSnapshot";
import { clearMirror } from "@/lib/docStore";
import { notifyDocsChanged } from "@/lib/localDocs";
import {
  getProbeServerState,
  getProbeState,
  startProbing,
  subscribeProbe,
} from "@/lib/sessionProbe";
import { useOnline } from "@/hooks/useOnline";

/** 渲染账号那一行用：在线拿会话，离线拿本地快照，两者字段对得上 */
export type AuthUser = Session["user"] | AuthSnapshot;

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

  // 每确认一次登录就刷新一次快照：confirmedAt 往后推，本地这份有效期跟着续
  useEffect(() => {
    const user = session?.user;
    if (status !== "authenticated" || !user) return;
    // 换了账号却没经过登出（另一个标签页登进别人、cookie 被换掉）：
    // 上一个账号的镜像必须在同步引擎开跑之前丢掉，否则两边文章会串成一堆。
    // 本 effect 排在 useDocLibrary 那几个之前，顺序是成立的
    if (!isSameAuthUser(user)) {
      clearMirror(); // 连快照一起清，紧接着的 save 写的就是新账号那份
      // 同步派事件时 useDocLibrary 的监听还没挂上（同一轮 effect 里它在后面），推到微任务
      queueMicrotask(() => notifyDocsChanged());
    }
    saveAuthSnapshot(user);
  }, [status, session?.user]);

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
    user: session?.user ?? readAuthSnapshot() ?? undefined,
  };
}

export type AuthMode = ReturnType<typeof useAuthMode>;
