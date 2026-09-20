"use client";

/**
 * 后台的「AI 设置」：全站 AI 审核用哪个模型，以及各家上游的 token。
 *
 * 前台不给用户选模型，也不收 key——都在这里定（接口见 /api/admin/ai）。
 * token 只进不出：这里只看得到「来源 + 末四位」，输入框永远是空的，填了才覆盖。
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AiIcon } from "@/components/AiIcon";
import { toast } from "@/components/Toast";

interface ProviderInfo {
  id: string;
  label: string;
  models: string[];
  slot: string;
}
interface KeyStatus {
  slot: string;
  source: "admin" | "env" | "none";
  last4: string;
}
interface Snapshot {
  review: { provider: string; model: string };
  providers: ProviderInfo[];
  keys: KeyStatus[];
}

const CUSTOM = "__custom";
const field =
  "w-full rounded-md border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1.5 text-[12.5px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]";
const label = "mb-1 block text-[11.5px] text-[var(--ink-faint)]";
const primaryBtn =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12.5px] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40";

/** 槽位显示成人话：同一把 Replicate token 管着 Claude 和 GPT 两家 */
function slotLabel(slot: string, providers: ProviderInfo[]): string {
  return providers
    .filter((p) => p.slot === slot)
    .map((p) => p.label)
    .join(" / ");
}

function sourceText(k: KeyStatus): string {
  const tail = k.last4 ? `（…${k.last4}）` : "";
  if (k.source === "admin") return `已在后台填写${tail}`;
  if (k.source === "env") return `来自环境变量 ${k.slot}${tail}`;
  return "未配置";
}

export function AiSettingsCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [customOn, setCustomOn] = useState(false);
  /** 只放这次要改的槽位；没碰过的不会出现在请求里 */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const adopt = (data: Snapshot) => {
    setSnap(data);
    setProvider(data.review.provider);
    setModel(data.review.model);
    setCustomOn(false);
    setDrafts({});
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/ai")
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) adopt(data);
      })
      .catch(() => {
        if (!cancelled) toast("AI 设置加载失败", "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snap) return null;
  const spec = snap.providers.find((p) => p.id === provider) ?? snap.providers[0];
  const custom = customOn || !spec.models.includes(model);
  const chosenKey = snap.keys.find((k) => k.slot === spec.slot);
  const dirty =
    provider !== snap.review.provider ||
    model !== snap.review.model ||
    Object.keys(drafts).length > 0;

  const save = async (body: Record<string, unknown>, done: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Snapshot & { error?: string };
      if (!res.ok) {
        toast(data.error ?? "保存失败", "error");
        return;
      }
      adopt(data);
      toast(done, "success");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-5 py-4">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--ink)]">
        <AiIcon size={14} className="text-[var(--accent)]" />
        AI 设置
      </div>
      <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
        全站的 AI 审核统一用这里选的模型，前台不给用户选。Token
        加密后入库，保存后只显示末四位；留空表示不改。
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>审核用哪一家</span>
          <select
            className={field}
            value={spec.id}
            onChange={(e) => {
              const next = snap.providers.find((p) => p.id === e.target.value)!;
              setProvider(next.id);
              setModel(next.models[0]); // 上一家的模型名在这一家多半不存在
              setCustomOn(false);
            }}
          >
            {snap.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>模型</span>
          <select
            className={field}
            value={custom ? CUSTOM : model}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustomOn(true);
                return;
              }
              setCustomOn(false);
              setModel(e.target.value);
            }}
          >
            {spec.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {/* 各家随时会上新，留个自己填的口子，不用等这份清单更新 */}
            <option value={CUSTOM}>自定义…</option>
          </select>
          {custom ? (
            <input
              className={`${field} mt-1.5`}
              value={model}
              spellCheck={false}
              placeholder={spec.models[0]}
              onChange={(e) => setModel(e.target.value)}
            />
          ) : null}
        </div>
      </div>
      {chosenKey?.source === "none" ? (
        <p className="mt-2 text-[12px] text-[var(--danger,#c0392b)]">
          这一家还没有 Token，前台的「开始审核」会是灰的——在下面填上。
        </p>
      ) : null}

      <div className="mt-5 text-[12px] font-medium text-[var(--ink-soft)]">各家 Token</div>
      <div className="mt-2 flex flex-col gap-2.5">
        {snap.keys.map((k) => (
          <div key={k.slot} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[200px_1fr_auto]">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] text-[var(--ink)]">
                {slotLabel(k.slot, snap.providers)}
              </div>
              <div className="truncate text-[11px] text-[var(--ink-faint)]">{sourceText(k)}</div>
            </div>
            <input
              className={field}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={k.source === "none" ? "粘贴 Token" : "留空不改；粘贴新的即覆盖"}
              value={drafts[k.slot] ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setDrafts((d) => {
                  const next = { ...d };
                  if (value) next[k.slot] = value;
                  else delete next[k.slot];
                  return next;
                });
              }}
            />
            {k.source === "admin" ? (
              <button
                className="cursor-pointer whitespace-nowrap text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40"
                disabled={saving}
                onClick={() => void save({ keys: { [k.slot]: "" } }, "已清除这把 Token")}
              >
                清除
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          className={primaryBtn}
          disabled={!dirty || saving || model.trim() === ""}
          onClick={() => void save({ provider, model, keys: drafts }, "AI 设置已保存")}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          保存
        </button>
      </div>
    </div>
  );
}
