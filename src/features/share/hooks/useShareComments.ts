"use client";

// 分享页的批注读写：访客身份、轮询刷新、发表/回复、解决、删除。
// 与正文渲染、锚点定位无关的那一半，从 SharedArticle 搬出。

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { loadIdentity, saveIdentityName, type GuestIdentity } from "../identity";
import type { AnchorType, ShareCommentJson } from "../types";

/** 待提交批注的锚点：文字选区或媒体 */
export interface CommentAnchor {
  type: AnchorType;
  anchorText: string;
  anchorPrefix: string;
  anchorIndex: number;
}

/**
 * 列表内容指纹：轮询回来的和手上这份一致就别 setState。
 * 换掉 comments 会触发 SharedArticle 重铺高亮（clearHighlights 里有 root.normalize()），
 * 读者正在划的选区当场就塌了 —— 30 秒一次，撞上的概率不低。
 * 服务端的排序是稳定的，所以按顺序拼串比就够；没有 updatedAt，正文/解决态自己入串。
 */
function signature(list: ShareCommentJson[]): string {
  return list
    .map((c) => [c.id, c.parentId ?? "", c.resolvedAt ?? "", c.mine ? "1" : "", c.author, c.body].join(""))
    .join("");
}

/** 读者正在划词，或批注浮层/回复框开着：这一轮先不换列表，留到下一轮 */
function readerBusy(overlayOpen: boolean): boolean {
  if (overlayOpen) return true;
  const sel = window.getSelection();
  return !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
}

export function useShareComments({
  token,
  viewerIsOwner,
  initialComments,
  activeId,
  /** 批注浮层/回复框是否开着：开着时轮询不替换列表，免得把正在写的交互打断 */
  overlayOpen,
  /** 顶级批注发表成功：把新线程点亮 */
  onRootPosted,
  /** 当前线程不该再展开（已解决或已删除） */
  onThreadClosed,
}: {
  token: string;
  viewerIsOwner: boolean;
  initialComments: ShareCommentJson[];
  activeId: string | null;
  overlayOpen: boolean;
  onRootPosted: (id: string) => void;
  onThreadClosed: () => void;
}) {
  const [comments, setComments] = useState<ShareCommentJson[]>(initialComments);
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);

  const identityRef = useRef<GuestIdentity | null>(null);
  // 轮询回调只建一次（deps 只有 token），当下的列表与浮层状态现读现取。
  // 同步放在 effect 里而不是渲染期：渲染期写 ref 被 react-hooks/refs 禁掉，
  // 而轮询是提交之后才异步触发的，读到的一定是最近一次提交的值。
  const commentsRef = useRef(comments);
  const overlayOpenRef = useRef(overlayOpen);
  useEffect(() => {
    commentsRef.current = comments;
    overlayOpenRef.current = overlayOpen;
  }, [comments, overlayOpen]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}/comments`, {
        headers: identityRef.current ? { "x-guest-key": identityRef.current.key } : {},
      });
      if (!res.ok) return;
      const next: ShareCommentJson[] = await res.json();
      // 没变化就什么都不做：引用不动，正文高亮也就不会白重铺一遍
      if (signature(next) === signature(commentsRef.current)) return;
      if (readerBusy(overlayOpenRef.current)) return;
      setComments(next);
    } catch {
      // 网络失败保持现状，下轮再试
    }
  }, [token]);

  useEffect(() => {
    identityRef.current = loadIdentity();
    setGuestName(identityRef.current.name);
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  /**
   * 发表批注（anchor 有值）或回复（parentId 有值）。
   * 正文由调用方的输入框传进来 —— 新批注卡与回复框各管自己的草稿，
   * 共用一份 draft 会互相串台（写了一半的回复跑到下一张新批注卡里）。
   * 返回是否真的发出去了，调用方据此决定要不要清空自己的输入框。
   */
  const submit = useCallback(
    async (parentId: string | null, text: string, anchor?: CommentAnchor): Promise<boolean> => {
      const body = text.trim();
      if (!body || busy) return false;
      setBusy(true);
      try {
        const name = guestName.trim().slice(0, 30);
        if (!viewerIsOwner && name) saveIdentityName(name);
        const res = await fetch(`/api/share/${token}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            author: name,
            key: identityRef.current?.key ?? "",
            parentId,
            ...(anchor
              ? {
                  anchorType: anchor.type,
                  anchorText: anchor.anchorText,
                  anchorPrefix: anchor.anchorPrefix,
                  anchorIndex: anchor.anchorIndex,
                }
              : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast(data.error ?? "批注失败，请稍后再试", "error");
          return false;
        }
        const created: ShareCommentJson = await res.json();
        setComments((prev) => [...prev, created]);
        if (!parentId) {
          window.getSelection()?.removeAllRanges();
          onRootPosted(created.id);
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [busy, guestName, viewerIsOwner, token, onRootPosted]
  );

  const resolveThread = useCallback(
    async (id: string, resolved: boolean) => {
      const res = await fetch(`/api/share/${token}/comments/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          // 访客身份统一走请求头（删除那条一直是这么发的）
          ...(identityRef.current ? { "x-guest-key": identityRef.current.key } : {}),
        },
        body: JSON.stringify({ resolved }),
      });
      if (res.ok) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, resolvedAt: resolved ? new Date().toISOString() : null } : c
          )
        );
        if (resolved) onThreadClosed();
      }
    },
    [token, onThreadClosed]
  );

  const removeComment = useCallback(
    async (c: ShareCommentJson) => {
      const res = await fetch(`/api/share/${token}/comments/${c.id}`, {
        method: "DELETE",
        headers: identityRef.current ? { "x-guest-key": identityRef.current.key } : {},
      });
      if (res.ok) {
        setComments((prev) => prev.filter((x) => x.id !== c.id && x.parentId !== c.id));
        if (activeId === c.id) onThreadClosed();
      }
    },
    [token, activeId, onThreadClosed]
  );

  return {
    comments,
    guestName,
    setGuestName,
    busy,
    submit,
    resolveThread,
    removeComment,
  };
}
