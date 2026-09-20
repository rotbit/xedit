"use client";

/**
 * 后台的「审核提示词」：每类审核一份「审核要求」，管理员随便改。
 *
 * 能改的只有「你是谁、重点看什么、话怎么说」这一段；JSON 形状、分类、引文逐字这些
 * 「输出格式」是解析与正文定位的命根子，服务端永远接在后面，这里只读展示——
 * 让人知道不用自己写，也改不坏。默认文案就填在输入框里，「恢复默认」随时回得去。
 */
import { useEffect, useState } from "react";
import { FileText, Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/components/Toast";

interface PromptInfo {
  kind: string;
  label: string;
  text: string;
  defaultText: string;
  custom: boolean;
  formatRules: string;
}
interface Snapshot {
  prompts: PromptInfo[];
  promptMaxChars: number;
}

const primaryBtn =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12.5px] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40";
const ghostBtn =
  "inline-flex cursor-pointer items-center gap-1 text-[12px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[var(--ink-faint)]";

export function AiPromptCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [kind, setKind] = useState("");
  /** 各类正在编辑的文字；切页签不丢 */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const adopt = (data: Snapshot) => {
    setSnap(data);
    setDrafts(Object.fromEntries(data.prompts.map((p) => [p.kind, p.text])));
    setKind((prev) => prev || data.prompts[0]?.kind || "");
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/ai")
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) adopt(data);
      })
      .catch(() => {
        if (!cancelled) toast("审核提示词加载失败", "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = snap?.prompts.find((p) => p.kind === kind);
  if (!snap || !current) return null;
  const draft = drafts[kind] ?? "";
  const max = snap.promptMaxChars;
  const dirty = draft.trim() !== current.text.trim();
  const isDefault = draft.trim() === current.defaultText.trim();
  const tooLong = draft.trim().length > max;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: { [kind]: draft } }),
      });
      const data = (await res.json().catch(() => ({}))) as Snapshot & { error?: string };
      if (!res.ok) {
        toast(data.error ?? "保存失败", "error");
        return;
      }
      // 只认回这一类：另一个页签里没保存的草稿别被冲掉
      setSnap(data);
      const saved = data.prompts.find((p) => p.kind === kind);
      if (saved) setDrafts((d) => ({ ...d, [kind]: saved.text }));
      toast(isDefault ? "已恢复默认提示词" : "提示词已保存，下一次审核起生效", "success");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-5 py-4">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--ink)]">
        <FileText size={14} className="text-[var(--accent)]" />
        审核提示词
      </div>
      <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
        告诉 AI 它是谁、重点看什么、意见怎么写。改完保存，下一次审核起生效；输出格式由系统自动接在后面，不用写。
      </p>

      <div className="mt-3 flex items-center gap-1">
        {snap.prompts.map((p) => {
          const on = p.kind === kind;
          const edited = (drafts[p.kind] ?? "").trim() !== p.text.trim();
          return (
            <button
              key={p.kind}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[12.5px] transition-colors ${
                on
                  ? "bg-[var(--accent-wash)] text-[var(--ink)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
              onClick={() => setKind(p.kind)}
            >
              {p.label}
              {p.custom ? <span className="ml-1 text-[11px] text-[var(--ink-faint)]">已自定义</span> : null}
              {edited ? <span className="ml-1 text-[var(--accent)]">•</span> : null}
            </button>
          );
        })}
      </div>

      <textarea
        className="mt-2 block h-[300px] w-full resize-y rounded-md border border-[var(--hairline)] bg-[var(--bg)] px-3 py-2.5 text-[13px] leading-[1.75] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDrafts((d) => ({ ...d, [kind]: e.target.value }))}
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          className={ghostBtn}
          disabled={isDefault || saving}
          title="把输入框换回默认文案（还要点保存才生效）"
          onClick={() => setDrafts((d) => ({ ...d, [kind]: current.defaultText }))}
        >
          <RotateCcw size={12} />
          恢复默认
        </button>
        <span
          className={`text-[11.5px] tabular-nums ${
            tooLong ? "text-[var(--danger,#c0392b)]" : "text-[var(--ink-faint)]"
          }`}
        >
          {draft.trim().length} / {max}
        </span>
        <button
          className={`${primaryBtn} ml-auto`}
          disabled={!dirty || saving || tooLong || draft.trim() === ""}
          onClick={() => void save()}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          保存
        </button>
      </div>

      <details className="mt-3 text-[12px] text-[var(--ink-faint)]">
        <summary className="cursor-pointer select-none hover:text-[var(--ink)]">
          系统自动接在后面的「输出格式」（只读）
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-md border border-[var(--hairline-soft)] bg-[var(--bg)] px-3 py-2.5 font-[inherit] text-[12px] leading-[1.7] text-[var(--ink-soft)]">
          {current.formatRules}
        </pre>
      </details>
    </div>
  );
}
