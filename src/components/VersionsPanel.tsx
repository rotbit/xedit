"use client";

import { useCallback, useEffect, useState } from "react";
import { X, History, Loader2, ArchiveRestore, BookmarkPlus, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { toast } from "./Toast";

export interface VersionMeta {
  id: string;
  title: string;
  kind: "auto" | "manual" | "restore";
  createdAt: string;
  chars: number;
}

const KIND_LABEL: Record<VersionMeta["kind"], { text: string; cls: string }> = {
  auto: { text: "自动", cls: "bg-[var(--paper)] text-[var(--ink-faint)]" },
  manual: { text: "手动", cls: "bg-[#eef4fb] text-[#1e6bb8]" },
  restore: { text: "回滚备份", cls: "bg-[var(--accent-wash)] text-[var(--accent-deep)]" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = `${sameYear ? "" : d.getFullYear() + "/"}${d.getMonth() + 1}/${d.getDate()}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VersionsPanel({
  open,
  onClose,
  loggedIn,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  loggedIn: boolean;
  /** 回滚成功后由外层重新加载文档 */
  onRestored: (docId: string) => void;
}) {
  const docId = useStore((s) => s.docId);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <aside
        className="absolute bottom-7 right-0 top-12 flex w-[340px] flex-col border-l border-[var(--hairline)] bg-[var(--panel)] shadow-[-8px_0_30px_rgba(40,30,10,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {loggedIn && docId ? (
          <VersionList docId={docId} onClose={onClose} onRestored={onRestored} />
        ) : (
          <>
            <PanelHeader onClose={onClose} />
            <p className="px-6 py-10 text-center text-[12px] leading-6 text-[var(--ink-faint)]">
              版本历史随云端同步提供。
              <br />
              登录 GitHub 后，自动保存会按时间留存版本，可一键回滚。
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function PanelHeader({ onClose, extra }: { onClose: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--hairline)] pl-4 pr-2">
      <span className="flex items-center gap-2 text-[13px] font-medium">
        <History size={15} className="text-[var(--ink-soft)]" />
        版本历史
      </span>
      <div className="flex items-center gap-1">
        {extra}
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function VersionList({
  docId,
  onClose,
  onRestored,
}: {
  docId: string;
  onClose: () => void;
  onRestored: (docId: string) => void;
}) {
  // null 表示加载中
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<VersionMeta[] | null> => {
    const res = await fetch(`/api/documents/${docId}/versions`);
    return res.ok ? await res.json() : null;
  }, [docId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((list) => {
      if (!cancelled) setVersions(list ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = async () => {
    setVersions(await load());
  };

  const saveNow = async () => {
    const res = await fetch(`/api/documents/${docId}/versions`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(data.created ? "已存档当前版本" : "内容与最近版本相同，无需重复存档", data.created ? "success" : "info");
      await refresh();
    } else {
      toast("存档失败", "error");
    }
  };

  const restore = async (v: VersionMeta) => {
    if (!confirm(`回滚到 ${formatTime(v.createdAt)} 的版本？\n当前内容会先自动备份为一个新版本。`)) {
      return;
    }
    setBusyId(v.id);
    try {
      const res = await fetch(`/api/documents/${docId}/versions/${v.id}`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast("已回滚到所选版本", "success");
      onRestored(docId);
      await refresh();
    } catch {
      toast("回滚失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (v: VersionMeta) => {
    if (!confirm("删除该版本快照？")) return;
    const res = await fetch(`/api/documents/${docId}/versions/${v.id}`, { method: "DELETE" });
    if (res.ok) await refresh();
    else toast("删除失败", "error");
  };

  return (
    <>
      <PanelHeader
        onClose={onClose}
        extra={
          <button
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--accent)]"
            onClick={() => void saveNow()}
            title="把当前内容立即存为一个版本"
          >
            <BookmarkPlus size={14} />
            存档
          </button>
        }
      />
      {versions === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--ink-faint)]">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      ) : versions.length === 0 ? (
        <p className="px-6 py-10 text-center text-[12px] leading-6 text-[var(--ink-faint)]">
          还没有版本。编辑会实时自动保存，停止编辑 5 分钟后
          自动定格为一个版本；也可以点右上角「存档」立即保存。
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {versions.map((v, i) => (
            <div
              key={v.id}
              className="group mx-2 mb-0.5 rounded-md px-3 py-2 hover:bg-[var(--paper)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium text-[var(--ink)]">
                  {formatTime(v.createdAt)}
                </span>
                <span
                  className={`rounded px-1.5 py-px text-[10px] ${KIND_LABEL[v.kind]?.cls ?? ""}`}
                >
                  {KIND_LABEL[v.kind]?.text ?? v.kind}
                </span>
                {i === 0 ? <span className="text-[10px] text-[var(--ink-faint)]">最新</span> : null}
                <span className="flex-1" />
                <button
                  className="invisible cursor-pointer rounded p-1 text-[var(--ink-faint)] hover:bg-white hover:text-red-600 group-hover:visible"
                  title="删除该版本"
                  onClick={() => void remove(v)}
                >
                  <Trash2 size={12} />
                </button>
                <button
                  className="invisible flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--ink-soft)] hover:bg-white hover:text-[var(--accent)] group-hover:visible"
                  title="回滚到该版本"
                  onClick={() => void restore(v)}
                  disabled={busyId !== null}
                >
                  {busyId === v.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ArchiveRestore size={12} />
                  )}
                  回滚
                </button>
              </div>
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-faint)]">
                {v.title || "未命名文章"} · {v.chars} 字
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
