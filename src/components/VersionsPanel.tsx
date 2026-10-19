"use client";

/**
 * Version history drawer (docked right) and version preview overlay (filling the left); all data comes from /api/documents/[id]/versions.
 * Only signed-in users' cloud documents have a version table; in local mode or when signed out this just shows an explanation.
 * The server keeps at most 100 versions per document, returned newest first (see lib/versions.ts), so the first list item is the latest.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, History, Loader2, ArchiveRestore, BookmarkPlus, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useEscape } from "@/hooks/useEscape";
import { diffLines } from "@/lib/diffLines";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatDateTime } from "@/lib/format";
import { toast } from "./Toast";
import { askConfirm } from "./PromptDialog";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { rich } from "@/i18n/rich";

/** List item: the API deliberately omits the body (word count only); VersionPreview fetches the body separately */
export interface VersionMeta {
  id: string;
  title: string;
  kind: "auto" | "manual" | "restore";
  createdAt: string;
  chars: number;
}

// All three sources are fixed server-side: auto = periodic snapshot while writing, manual = clicked 「存档」 (Save version), restore = automatic backup of the current draft before rolling back
const KIND_LABEL: Record<VersionMeta["kind"], { text: string; cls: string }> = {
  auto: { text: tk("自动"), cls: "bg-[var(--paper)] text-[var(--ink-faint)]" },
  manual: { text: tk("手动"), cls: "bg-[#eef4fb] text-[#1e6bb8] dark:bg-[#1c2a3a] dark:text-[#7fb3e8]" },
  restore: { text: tk("回滚备份"), cls: "bg-[var(--accent-wash)] text-[var(--accent-deep)]" },
};

/** Timestamp in the version list: omit the year when it's the current one — nearly all entries are from this year, so the year is noise */
const versionTime = (iso: string) => formatDateTime(iso, { omitCurrentYear: true });

/** Version history drawer: lists this document's snapshots, with diff preview, rollback, delete, or saving a version now */
export function VersionsPanel({
  open,
  onClose,
  loggedIn,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  loggedIn: boolean;
  /** After a successful rollback the parent reloads the document */
  onRestored: (docId: string) => void;
}) {
  const docId = useStore((s) => s.docId);
  const t = useT();
  useEscape(onClose, open);
  // Both hooks above must be called unconditionally (useEscape toggles via its second argument), so the return has to come after them
  if (!open) return null;

  return (
    // z-80 is below the dialog shell's default 110 (see components/Modal.tsx): rollback/delete confirmations must stack above the drawer
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <aside
        // top-12 clears the top bar, bottom-7 clears the bottom status bar; the 340 width pairs with VersionPreview's right-[340px], so change both together
        className="absolute bottom-7 right-0 top-12 flex w-[340px] flex-col border-l border-[var(--hairline)] bg-[var(--panel)] shadow-[-8px_0_30px_rgba(0,0,0,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {loggedIn && docId ? (
          <VersionList docId={docId} onClose={onClose} onRestored={onRestored} />
        ) : (
          <>
            <PanelHeader onClose={onClose} />
            <p className="px-6 py-10 text-center text-[12px] leading-6 text-[var(--ink-faint)]">
              {t("版本历史随云端同步提供。")}
              <br />
              {t("登录 GitHub 后，自动保存会按时间留存版本，可一键回滚。")}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function PanelHeader({ onClose, extra }: { onClose: () => void; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--hairline)] pl-4 pr-2">
      <span className="flex items-center gap-2 text-[13px] font-medium">
        <History size={16} className="text-[var(--ink-soft)]" />
        {t("版本历史")}
      </span>
      <div className="flex items-center gap-1">
        {extra}
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Version preview: overlays the editing area (left of the version drawer), showing the selected version's full text
 * with a line-level diff against the current draft — green = in this version but not the current draft (rollback restores it),
 * red = in the current draft but not this version (rollback discards it).
 */
function VersionPreview({
  docId,
  version,
  onClose,
  onRestore,
  restoring,
}: {
  docId: string;
  version: VersionMeta;
  onClose: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  // The current draft is snapshotted only once at mount (= when this version is selected): with a live subscription, background autosave
  // or the sync engine updating the store would recompute/jump the whole diff in front of the user. version.id is the key,
  // so switching versions remounts and takes a fresh snapshot of the current draft
  const t = useT();
  const [current] = useState(() => {
    const s = useStore.getState();
    return { title: s.title, content: s.content };
  });
  const currentTitle = current.title;
  const [snap, setSnap] = useState<{ title: string; content: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // The component mounts keyed by version.id: switching versions remounts, so state naturally resets
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/documents/${docId}/versions/${version.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (cancelled) return;
        if (v?.content !== undefined) setSnap({ title: v.title ?? "", content: v.content });
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, version.id]);

  // The current draft is already a snapshot, so the diff is computed once when the version content arrives
  const diff = useMemo(
    () => (snap ? diffLines(current.content, snap.content) : null),
    [snap, current.content]
  );
  const stats = useMemo(() => {
    if (!diff) return null;
    let add = 0;
    let del = 0;
    for (const l of diff) {
      if (l.type === "add") add++;
      else if (l.type === "del") del++;
    }
    return { add, del };
  }, [diff]);

  return (
    // right-[340px] exactly clears the drawer on the right; on narrow screens (max-md) it fills the width and, coming after the drawer in the DOM, covers it
    <section className="fixed bottom-7 left-0 right-[340px] top-12 flex flex-col border-r border-[var(--hairline)] bg-[var(--paper)] max-md:right-0">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--panel)] pl-5 pr-2">
        <span className="text-[13px] font-medium">{versionTime(version.createdAt)}</span>
        <span className={`rounded px-1.5 py-px text-[10px] ${KIND_LABEL[version.kind]?.cls ?? ""}`}>
          {KIND_LABEL[version.kind] ? t(KIND_LABEL[version.kind].text) : version.kind}
        </span>
        {stats ? (
          stats.add || stats.del ? (
            <span className="text-[11.5px] text-[var(--ink-faint)]">
              {rich(t("{add} {del} 行", { lines: stats.add + stats.del }), {
                add: <span className="text-emerald-600 dark:text-emerald-400">+{stats.add}</span>,
                del: <span className="text-red-600 dark:text-red-400">−{stats.del}</span>,
              })}
            </span>
          ) : (
            <span className="text-[11px] text-[var(--ink-faint)]">{t("与当前稿一致")}</span>
          )
        ) : null}
        <span className="flex-1" />
        {stats && (stats.add || stats.del) ? (
          <span className="hidden text-[11px] text-[var(--ink-faint)] lg:block">
            {t("绿 = 该版本独有（回滚恢复） · 红 = 当前稿独有（回滚丢弃）")}
          </span>
        ) : null}
        <button
          className="ml-1 flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 text-[12px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
          onClick={onRestore}
          disabled={restoring || !snap}
        >
          {restoring ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <ArchiveRestore size={12} />
          )}
          {t("回滚到此版本")}
        </button>
        <button
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          title={t("关闭预览")}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      {failed ? (
        <p className="py-10 text-center text-[12px] text-[var(--ink-faint)]">{t("版本加载失败")}</p>
      ) : !diff || !snap ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--ink-faint)]">
          <Loader2 size={14} className="animate-spin" /> {t("加载中…")}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[820px] px-6 py-5">
            {snap.title !== currentTitle ? (
              <div className="mb-4 rounded-md border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 text-[12px]">
                {t("标题：")}
                <span className="text-red-600 line-through dark:text-red-400">
                  {currentTitle || t(UNTITLED_DOC)}
                </span>
                <span className="mx-1.5 text-[var(--ink-faint)]">→</span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  {snap.title || t(UNTITLED_DOC)}
                </span>
              </div>
            ) : null}
            <div className="font-mono text-[12.5px] leading-[1.8]">
              {diff.map((l, i) => (
                <div
                  key={i}
                  className={`flex rounded-[3px] ${
                    l.type === "add"
                      ? "bg-emerald-100/70 dark:bg-emerald-900/30"
                      : l.type === "del"
                        ? "bg-red-100/60 text-[var(--ink-soft)] dark:bg-red-900/25"
                        : ""
                  }`}
                >
                  <span
                    className={`w-5 shrink-0 select-none text-center text-[11px] leading-[1.9] ${
                      l.type === "add"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : l.type === "del"
                          ? "text-red-500 dark:text-red-400"
                          : "text-transparent"
                    }`}
                  >
                    {l.type === "add" ? "+" : l.type === "del" ? "−" : ""}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {l.text || " "}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
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
  const t = useT();
  // null means loading
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The version being previewed: its content shows in the left overlay, diffed against the current draft */
  const [preview, setPreview] = useState<VersionMeta | null>(null);

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

  // A failed load returns null, which below means "loading": a failed refresh stays in the loading state rather than leaving a possibly stale list
  const refresh = async () => {
    setVersions(await load());
  };

  // No body: the server saves it as manual, deduped only against the latest version (snapshot in lib/versions.ts), so created=false means nothing changed
  const saveNow = async () => {
    const res = await fetch(`/api/documents/${docId}/versions`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(data.created ? t("已存档当前版本") : t("内容与最近版本相同，无需重复存档"), data.created ? "success" : "info");
      await refresh();
    } else {
      toast(t("存档失败"), "error");
    }
  };

  // The "current content will be backed up first" in the prompt isn't done here: the server, in one transaction, saves a kind=restore version first and then overwrites the document with the old content
  const restore = async (v: VersionMeta) => {
    const ok = await askConfirm({
      title: t("回滚到该版本"),
      message: t("回滚到 {time} 的版本？\n当前内容会先自动备份为一个新版本。", { time: versionTime(v.createdAt) }),
      confirmText: t("回滚"),
    });
    if (!ok) return;
    setBusyId(v.id);
    try {
      const res = await fetch(`/api/documents/${docId}/versions/${v.id}`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast(t("已回滚到所选版本"), "success");
      setPreview(null); // After rollback the current draft has changed, so the preview is meaningless
      onRestored(docId);
      await refresh();
    } catch {
      toast(t("回滚失败"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (v: VersionMeta) => {
    const ok = await askConfirm({
      title: t("删除版本"),
      message: t("删除该版本快照？"),
      confirmText: t("删除"),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${docId}/versions/${v.id}`, { method: "DELETE" });
    if (res.ok) {
      if (preview?.id === v.id) setPreview(null);
      await refresh();
    } else {
      toast(t("删除失败"), "error");
    }
  };

  return (
    <>
      <PanelHeader
        onClose={onClose}
        extra={
          <button
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--accent)]"
            onClick={() => void saveNow()}
            title={t("把当前内容立即存为一个版本")}
          >
            <BookmarkPlus size={14} />
            {t("存档")}
          </button>
        }
      />
      {versions === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--ink-faint)]">
          <Loader2 size={14} className="animate-spin" /> {t("加载中…")}
        </div>
      ) : versions.length === 0 ? (
        <p className="px-6 py-10 text-center text-[12px] leading-6 text-[var(--ink-faint)]">
          {t(
            "还没有版本。编辑会实时自动保存，首次保存先留个底，之后每写满 10 分钟定格一版，停笔或关页面时再补一版；也可以点右上角「存档」立即保存。"
          )}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          <p className="px-4 pb-1.5 pt-1 text-[11px] text-[var(--ink-faint)]">
            {t("点任意版本，左侧预览内容与改动")}
          </p>
          {versions.map((v, i) => (
            <div
              key={v.id}
              className={`group mx-2 mb-0.5 cursor-pointer rounded-md px-3 py-2 ${
                preview?.id === v.id
                  ? "bg-[var(--accent-wash)]"
                  : "hover:bg-[var(--paper)]"
              }`}
              onClick={() => setPreview(preview?.id === v.id ? null : v)}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[12.5px] font-medium ${
                    preview?.id === v.id ? "text-[var(--accent-deep)]" : "text-[var(--ink)]"
                  }`}
                >
                  {versionTime(v.createdAt)}
                </span>
                <span
                  className={`rounded px-1.5 py-px text-[10px] ${KIND_LABEL[v.kind]?.cls ?? ""}`}
                >
                  {KIND_LABEL[v.kind] ? t(KIND_LABEL[v.kind].text) : v.kind}
                </span>
                {/* The API returns versions by createdAt descending, so only index 0 is the latest */}
                {i === 0 ? <span className="text-[10px] text-[var(--ink-faint)]">{t("最新")}</span> : null}
                <span className="flex-1" />
                <button
                  // Touch screens have no hover, so group-hover never fires; under hover:none the delete and rollback buttons stay visible, or they'd be unreachable
                  className="invisible cursor-pointer rounded p-1 text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-red-600 dark:hover:text-red-400 group-hover:visible [@media(hover:none)]:visible"
                  title={t("删除该版本")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(v);
                  }}
                >
                  <Trash2 size={12} />
                </button>
                <button
                  className="invisible flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--panel)] hover:text-[var(--accent)] group-hover:visible [@media(hover:none)]:visible"
                  title={t("回滚到该版本")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void restore(v);
                  }}
                  disabled={busyId !== null}
                >
                  {busyId === v.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ArchiveRestore size={12} />
                  )}
                  {t("回滚")}
                </button>
              </div>
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-faint)]">
                {v.title || t(UNTITLED_DOC)} · {t("{n} 字", { n: v.chars, abs: v.chars })}
              </p>
            </div>
          ))}
        </div>
      )}
      {preview ? (
        <VersionPreview
          key={preview.id}
          docId={docId}
          version={preview}
          onClose={() => setPreview(null)}
          onRestore={() => void restore(preview)}
          restoring={busyId === preview.id}
        />
      ) : null}
    </>
  );
}
