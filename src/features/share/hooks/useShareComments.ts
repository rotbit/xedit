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

export function useShareComments({
  token,
  viewerIsOwner,
  initialComments,
  activeId,
  /** 顶级批注发表成功：把新线程点亮 */
  onRootPosted,
  /** 当前线程不该再展开（已解决或已删除） */
  onThreadClosed,
}: {
  token: string;
  viewerIsOwner: boolean;
  initialComments: ShareCommentJson[];
  activeId: string | null;
  onRootPosted: (id: string) => void;
  onThreadClosed: () => void;
}) {
  const [comments, setComments] = useState<ShareCommentJson[]>(initialComments);
  const [guestName, setGuestName] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const identityRef = useRef<GuestIdentity | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}/comments`, {
        headers: identityRef.current ? { "x-guest-key": identityRef.current.key } : {},
      });
      if (res.ok) setComments(await res.json());
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

  /** 发表批注（anchor 有值）或回复（parentId 有值） */
  const submit = useCallback(
    async (parentId: string | null, anchor?: CommentAnchor) => {
      const body = draft.trim();
      if (!body || busy) return;
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
          return;
        }
        const created: ShareCommentJson = await res.json();
        setComments((prev) => [...prev, created]);
        setDraft("");
        if (!parentId) {
          window.getSelection()?.removeAllRanges();
          onRootPosted(created.id);
        }
      } finally {
        setBusy(false);
      }
    },
    [draft, busy, guestName, viewerIsOwner, token, onRootPosted]
  );

  const resolveThread = useCallback(
    async (id: string, resolved: boolean) => {
      const res = await fetch(`/api/share/${token}/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved, key: identityRef.current?.key ?? "" }),
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
    draft,
    setDraft,
    busy,
    submit,
    resolveThread,
    removeComment,
  };
}
