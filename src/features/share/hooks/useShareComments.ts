"use client";

// Annotation reads/writes for the share page: visitor identity, polling refresh, post/reply, resolve, delete.
// The half unrelated to body rendering and anchor locating, moved out of SharedArticle.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { loadIdentity, saveIdentityName, type GuestIdentity } from "../identity";
import type { AnchorType, ShareCommentJson } from "../types";

/** Anchor for an annotation about to be posted: a text selection or media */
export interface CommentAnchor {
  type: AnchorType;
  anchorText: string;
  anchorPrefix: string;
  anchorIndex: number;
}

/**
 * Fingerprint of the list content: if the polled list matches the one in hand, don't setState.
 * Replacing comments makes SharedArticle re-lay highlights (clearHighlights calls root.normalize()),
 * which collapses the selection the reader is in the middle of making; at once every 30 seconds, collisions aren't rare.
 * Server ordering is stable, so concatenating in order is enough; there's no updatedAt, so body/resolved state go into the string themselves.
 */
function signature(list: ShareCommentJson[]): string {
  return list
    .map((c) => [c.id, c.parentId ?? "", c.resolvedAt ?? "", c.mine ? "1" : "", c.author, c.body].join(""))
    .join("");
}

/** Reader is selecting text, or the annotation popover/reply box is open: skip replacing the list this round, leave it for the next */
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
  /** Whether the annotation popover/reply box is open: while open, polling doesn't replace the list so it won't interrupt what's being written */
  overlayOpen,
  /** Top-level annotation posted: highlight the new thread */
  onRootPosted,
  /** The current thread should no longer be expanded (resolved or deleted) */
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
  // The polling callback is created once (deps are just token); the current list and popover state are read live.
  // Synced in an effect rather than during render: writing refs during render is banned by react-hooks/refs,
  // and polling fires asynchronously after commit, so it always reads the latest committed values.
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
      // Do nothing if unchanged: the reference stays the same, so body highlights aren't pointlessly re-laid
      if (signature(next) === signature(commentsRef.current)) return;
      if (readerBusy(overlayOpenRef.current)) return;
      setComments(next);
    } catch {
      // On network failure keep things as they are and retry next round
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
   * Post an annotation (anchor set) or a reply (parentId set).
   * The body comes from the caller's input: the new-annotation card and reply box each manage their own draft,
   * since a shared draft would leak between them (a half-written reply showing up in the next new-annotation card).
   * Returns whether it actually went out, so the caller can decide whether to clear its input.
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
          // Visitor identity always goes in a request header (delete has always sent it this way)
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
