"use client";

/**
 * 账号明细抽屉里的「功能权限」卡：逐项开关 AI 功能，并可单独给这个账号设每日次数上限。
 * 开关点了立刻 PATCH（先改界面，失败再拨回去）；上限在失焦或回车时才存，没改动不发请求。
 * 管理员由服务端按白名单默认全开，这里开关只做展示；封禁账号存着的权限不动，但期间用不了。
 */
import { useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { PERMISSIONS, type Permission } from "@/lib/permissionKeys";
import type { UserDetailResp } from "./types";

type LimitField = "aiReviewDailyLimit" | "aiCoverDailyLimit";

/** 权限 → 它的每日上限字段；加新权限时这里也要补一行 */
const LIMIT_FIELD: Record<Permission, LimitField> = {
  ai_review: "aiReviewDailyLimit",
  ai_cover: "aiCoverDailyLimit",
};

/** 与服务端校验一致：1..10000 的整数，留空=站点默认 */
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
  // 连点两个开关时，第二次要在第一次的乐观结果上改，所以另存一份不受闭包影响的最新值
  const permsRef = useRef(perms);
  // 已存下的上限（服务端认可的值），输入框失焦时拿它比对有没有改
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
    // 按 PERMISSIONS 的顺序重排，存进库里的数组顺序稳定，列表徽标的提示文字也不会忽前忽后
    const next = PERMISSIONS.map((p) => p.key).filter((k) =>
      k === key ? on : prev.includes(k)
    );
    permsRef.current = next;
    setPerms(next);
    if (await patch({ permissions: next })) {
      toast(on ? `已开通「${label}」` : `已关闭「${label}」`, "success");
    } else {
      // 只拨回这一项：期间若又点了别的开关，别把那一次也冲掉
      const rolled = PERMISSIONS.map((p) => p.key).filter((k) =>
        k === key ? !on : permsRef.current.includes(k)
      );
      permsRef.current = rolled;
      setPerms(rolled);
    }
  };

  /** 返回是否被接受：不合法或保存失败时由输入框自己把字改回去 */
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

/** 小号开关，外观同编辑器菜单里的 ToggleRow，补上 role="switch" 给读屏 */
function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-50 ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--hairline-strong)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? "left-3.5" : "left-0.5"}`}
      />
    </button>
  );
}

/** 每日上限输入框：留空=站点默认；失焦或回车才存，Esc 放弃这次修改 */
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
        // 只收数字：粘进来的「20 次」之类直接滤成 20，免得失焦时才报格式错
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            // 抽屉在 window 上听 Esc 关闭，这里拦住冒泡，只撤销输入；草稿回到已存值，之后失焦也不会发请求
            e.stopPropagation();
            reset();
          }
        }}
      />
      次
    </label>
  );
}
