"use client";

/**
 * The 「功能权限」 (Feature permissions) card in the account detail drawer: toggle each AI feature, and optionally set a per-account daily cap.
 * Toggles PATCH immediately (UI first, reverted on failure); caps are saved on blur or Enter, and nothing is sent if unchanged.
 * Admins have everything on by default via the server allowlist, so toggles here are display-only; a banned account keeps its stored permissions but can't use them meanwhile.
 */
import { useRef, useState } from "react";
import { Switch } from "@/components/Switch";
import { toast } from "@/components/Toast";
import { PERMISSIONS, type Permission } from "@/lib/permissionKeys";
import type { UserDetailResp } from "./types";

type LimitField = "aiReviewDailyLimit" | "aiCoverDailyLimit";

/** Permission → its daily cap field; add a line here when adding a new permission */
const LIMIT_FIELD: Record<Permission, LimitField> = {
  ai_review: "aiReviewDailyLimit",
  ai_cover: "aiCoverDailyLimit",
};

/** Matches server validation: an integer 1..10000, blank = site default */
const LIMIT_MAX = 10000;

export function UserPermissionsCard({
  user,
  totals,
  onChanged,
}: {
  user: UserDetailResp["user"];
  totals: UserDetailResp["totals"];
  onChanged?: () => void;
}) {
  const [perms, setPerms] = useState<Permission[]>(user.permissions);
  // When two toggles are clicked in a row, the second must build on the first's optimistic result, so keep a latest value that's immune to closures
  const permsRef = useRef(perms);
  // The saved cap (the value the server accepted), compared on blur to see if it changed
  const [limits, setLimits] = useState<Record<LimitField, number | null>>({
    aiReviewDailyLimit: user.aiReviewDailyLimit,
    aiCoverDailyLimit: user.aiCoverDailyLimit,
  });
  const defaults: Record<LimitField, number> = {
    aiReviewDailyLimit: totals.defaultAiReviewDailyLimit,
    aiCoverDailyLimit: totals.defaultAiCoverDailyLimit,
  };

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "保存失败", "error");
        return false;
      }
    } catch {
      toast("保存失败，检查网络后重试", "error");
      return false;
    }
    onChanged?.();
    return true;
  };

  const toggle = async (key: Permission, label: string, on: boolean) => {
    const prev = permsRef.current;
    // Reorder by PERMISSIONS so the stored array order is stable and the list badge's tooltip doesn't shuffle around
    const next = PERMISSIONS.map((p) => p.key).filter((k) =>
      k === key ? on : prev.includes(k)
    );
    permsRef.current = next;
    setPerms(next);
    if (await patch({ permissions: next })) {
      toast(on ? `已开通「${label}」` : `已关闭「${label}」`, "success");
    } else {
      // Revert only this one: if another toggle was clicked meanwhile, don't wipe that one too
      const rolled = PERMISSIONS.map((p) => p.key).filter((k) =>
        k === key ? !on : permsRef.current.includes(k)
      );
      permsRef.current = rolled;
      setPerms(rolled);
    }
  };

  /** Returns whether it was accepted: on invalid input or save failure the input reverts its own text */
  const saveLimit = async (field: LimitField, value: number | null): Promise<boolean> => {
    if (value === limits[field]) return true;
    if (!(await patch({ [field]: value }))) return false;
    setLimits((l) => ({ ...l, [field]: value }));
    toast(value === null ? "已恢复为默认上限" : `每日上限已设为 ${value} 次`, "success");
    return true;
  };

  return (
    <div className="mt-5">
      <p className="mb-1 text-[12px] font-medium text-[var(--ink-faint)]">功能权限</p>
      <div className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)] bg-[var(--paper)]/50">
        {PERMISSIONS.map((p) => {
          const field = LIMIT_FIELD[p.key];
          const on = user.admin || perms.includes(p.key);
          return (
            <div key={p.key} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-[var(--ink)]">{p.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-faint)]">{p.hint}</p>
                </div>
                <Switch
                  checked={on}
                  disabled={user.admin}
                  label={p.label}
                  onChange={(v) => void toggle(p.key, p.label, v)}
                />
              </div>
              <LimitInput
                saved={limits[field]}
                fallback={defaults[field]}
                label={`${p.label}每日上限`}
                onSave={(v) => saveLimit(field, v)}
              />
            </div>
          );
        })}
      </div>
      {user.admin ? (
        <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">管理员默认拥有全部权限</p>
      ) : null}
      {user.bannedAt ? (
        <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">封禁期间不能使用以上功能</p>
      ) : null}
    </div>
  );
}

/** Daily cap input: blank = site default; saved on blur or Enter, Esc discards the edit */
function LimitInput({
  saved,
  fallback,
  label,
  onSave,
}: {
  saved: number | null;
  fallback: number;
  label: string;
  onSave: (v: number | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(saved === null ? "" : String(saved));
  const reset = () => setDraft(saved === null ? "" : String(saved));

  const commit = async () => {
    const text = draft.trim();
    const value = text === "" ? null : Number(text);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > LIMIT_MAX)) {
      toast(`每日上限要填 1 到 ${LIMIT_MAX} 之间的整数，留空用默认`, "error");
      reset();
      return;
    }
    if (!(await onSave(value))) reset();
  };

  return (
    <label className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--ink-faint)]">
      每日上限
      <input
        inputMode="numeric"
        aria-label={label}
        className="h-7 w-[84px] rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-2 text-[12.5px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
        placeholder={`默认 ${fallback}`}
        value={draft}
        // Digits only: pasted text like 「20 次」 is filtered to 20, rather than erroring on blur
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            // The drawer listens for Esc on window to close; stop propagation here so it only cancels the edit. The draft reverts to the saved value, so a later blur sends nothing
            e.stopPropagation();
            reset();
          }
        }}
      />
      次
    </label>
  );
}
