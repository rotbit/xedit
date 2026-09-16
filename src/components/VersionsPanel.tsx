"use client";

/**
 * 版本历史抽屉（贴右）与版本预览盖层（占满左边），数据全来自 /api/documents/[id]/versions。
 * 只有登录用户的云端文档才有版本表，本地模式与未登录时这里只放一段说明文案。
 * 服务端每篇最多留 100 版、按时间倒序返回（见 lib/versions.ts），所以列表第一条就是最新的。
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

/** 列表项：接口刻意不返回正文（只带字数），正文由 VersionPreview 单独再取一次 */
export interface VersionMeta {
  id: string;
  title: string;
  kind: "auto" | "manual" | "restore";
  createdAt: string;
  chars: number;
}

// 三种来源都由服务端写死：auto=写作途中定时定格，manual=点了「存档」，restore=回滚前对当前稿的自动备份
const KIND_LABEL: Record<VersionMeta["kind"], { text: string; cls: string }> = {
  auto: { text: "自动", cls: "bg-[var(--paper)] text-[var(--ink-faint)]" },
  manual: { text: "手动", cls: "bg-[#eef4fb] text-[#1e6bb8] dark:bg-[#1c2a3a] dark:text-[#7fb3e8]" },
  restore: { text: "回滚备份", cls: "bg-[var(--accent-wash)] text-[var(--accent-deep)]" },
};

/** 版本列表里的时刻：同年的省掉年份——这里的条目绝大多数是今年的，年份纯噪音 */
const versionTime = (iso: string) => formatDateTime(iso, { omitCurrentYear: true });

/** 版本历史抽屉：列出这篇文档的版本快照，可预览 diff、回滚、删除，或立刻存一版 */
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
  useEscape(onClose, open);
  // 上面两个 hook 必须无条件调用（useEscape 靠第二个参数开关），所以 return 只能放在它们后面
  if (!open) return null;

  return (
    // z-80 低于弹窗外壳的默认 110（见 components/Modal.tsx）：回滚、删除的确认框要能压在抽屉上面
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <aside
        // top-12 让开顶栏、bottom-7 让开底部状态条；340 的宽度与 VersionPreview 的 right-[340px] 是一对，改一个就要改两处
        className="absolute bottom-7 right-0 top-12 flex w-[340px] flex-col border-l border-[var(--hairline)] bg-[var(--panel)] shadow-[-8px_0_30px_rgba(0,0,0,0.08)]"
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

/**
 * 版本预览：盖在编辑区上方（版本抽屉左侧），显示所选版本全文，
 * 并与当前稿做行级 diff——绿 = 该版本有而当前稿没有（回滚将恢复），
 * 红 = 当前稿有而该版本没有（回滚将丢弃）。
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
  // 当前稿只在挂载（= 选中这个版本）那一刻快照一次：活订阅的话，编辑区后台自动保存
  // 或同步引擎一改 store，整份 diff 就会在用户眼前重算/跳动。version.id 是 key，
  // 换版本重挂载即重新取一份最新的当前稿
  const [current] = useState(() => {
    const s = useStore.getState();
    return { title: s.title, content: s.content };
  });
  const currentTitle = current.title;
  const [snap, setSnap] = useState<{ title: string; content: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // 组件以 version.id 为 key 挂载：换版本即重挂载，状态天然回到初始值
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

  // 当前稿已是快照，diff 只在版本内容到手时算一次
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
    // right-[340px] 正好让开右边的抽屉；窄屏（max-md）改成铺满，它在 DOM 里排在抽屉之后，会直接盖住抽屉
    <section className="fixed bottom-7 left-0 right-[340px] top-12 flex flex-col border-r border-[var(--hairline)] bg-[var(--paper)] max-md:right-0">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--panel)] pl-5 pr-2">
        <span className="text-[13px] font-medium">{versionTime(version.createdAt)}</span>
        <span className={`rounded px-1.5 py-px text-[10px] ${KIND_LABEL[version.kind]?.cls ?? ""}`}>
          {KIND_LABEL[version.kind]?.text ?? version.kind}
        </span>
        {stats ? (
          stats.add || stats.del ? (
            <span className="text-[11.5px] text-[var(--ink-faint)]">
              <span className="text-emerald-600 dark:text-emerald-400">+{stats.add}</span>
              {" "}
              <span className="text-red-600 dark:text-red-400">−{stats.del}</span> 行
            </span>
          ) : (
            <span className="text-[11px] text-[var(--ink-faint)]">与当前稿一致</span>
          )
        ) : null}
        <span className="flex-1" />
        {stats && (stats.add || stats.del) ? (
          <span className="hidden text-[11px] text-[var(--ink-faint)] lg:block">
            绿 = 该版本独有（回滚恢复） · 红 = 当前稿独有（回滚丢弃）
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
          回滚到此版本
        </button>
        <button
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          title="关闭预览"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      {failed ? (
        <p className="py-10 text-center text-[12px] text-[var(--ink-faint)]">版本加载失败</p>
      ) : !diff || !snap ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--ink-faint)]">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[820px] px-6 py-5">
            {snap.title !== currentTitle ? (
              <div className="mb-4 rounded-md border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 text-[12px]">
                标题：
                <span className="text-red-600 line-through dark:text-red-400">
                  {currentTitle || UNTITLED_DOC}
                </span>
                <span className="mx-1.5 text-[var(--ink-faint)]">→</span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  {snap.title || UNTITLED_DOC}
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
  // null 表示加载中
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 正在预览的版本：内容在左侧盖层展示，与当前稿做 diff */
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

  // load 失败返回 null，而 null 在下面的渲染里表示「加载中」：刷新失败会停在加载态，不会留一份可能已过期的列表
  const refresh = async () => {
    setVersions(await load());
  };

  // 不带 body：服务端按 manual 存档，只与最近一版去重（lib/versions.ts 的 snapshot），所以 created=false 就是内容没变
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

  // 提示里那句「当前内容会先自动备份」不是这里做的：服务端在同一个事务里先存一版 kind=restore，再用旧内容覆盖文档
  const restore = async (v: VersionMeta) => {
    const ok = await askConfirm({
      title: "回滚到该版本",
      message: `回滚到 ${versionTime(v.createdAt)} 的版本？\n当前内容会先自动备份为一个新版本。`,
      confirmText: "回滚",
    });
    if (!ok) return;
    setBusyId(v.id);
    try {
      const res = await fetch(`/api/documents/${docId}/versions/${v.id}`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast("已回滚到所选版本", "success");
      setPreview(null); // 回滚后当前稿已变，预览失去意义
      onRestored(docId);
      await refresh();
    } catch {
      toast("回滚失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (v: VersionMeta) => {
    const ok = await askConfirm({
      title: "删除版本",
      message: "删除该版本快照？",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${docId}/versions/${v.id}`, { method: "DELETE" });
    if (res.ok) {
      if (preview?.id === v.id) setPreview(null);
      await refresh();
    } else {
      toast("删除失败", "error");
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
          还没有版本。编辑会实时自动保存，首次保存先留个底，之后每写满 10 分钟
          定格一版，停笔或关页面时再补一版；也可以点右上角「存档」立即保存。
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          <p className="px-4 pb-1.5 pt-1 text-[11px] text-[var(--ink-faint)]">
            点任意版本，左侧预览内容与改动
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
                  {KIND_LABEL[v.kind]?.text ?? v.kind}
                </span>
                {/* 接口按 createdAt 倒序给，所以只有下标 0 才是最新的一版 */}
                {i === 0 ? <span className="text-[10px] text-[var(--ink-faint)]">最新</span> : null}
                <span className="flex-1" />
                <button
                  // 触屏没有 hover，group-hover 永远不会触发，所以 hover:none 下让删除、回滚两个按钮常显，否则根本点不出来
                  className="invisible cursor-pointer rounded p-1 text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-red-600 dark:hover:text-red-400 group-hover:visible [@media(hover:none)]:visible"
                  title="删除该版本"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(v);
                  }}
                >
                  <Trash2 size={12} />
                </button>
                <button
                  className="invisible flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--panel)] hover:text-[var(--accent)] group-hover:visible [@media(hover:none)]:visible"
                  title="回滚到该版本"
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
                  回滚
                </button>
              </div>
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-faint)]">
                {v.title || UNTITLED_DOC} · {v.chars} 字
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
