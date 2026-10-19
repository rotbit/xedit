"use client";

/**
 * The review settings form: just picks review types (multi-select; all checked types are reviewed together).
 *
 * There's only one copy. Both the launch panel from the top bar's 「审核」 (Review) button (ReviewLaunchPopover) and the panel
 * from the pill on the review bar (ReviewAiSettings) embed it; with two separate copies,
 * sooner or later one would allow a choice the other doesn't.
 *
 * Which provider, which model and what key are set by the admin under 「AI 设置」 (AI settings) in the backend; they're neither selectable nor visible here.
 * The form only collects settings and saves them locally (see aiConfig.ts); the outside button decides when to actually run.
 */
import { REVIEW_KINDS } from "@/lib/ai/reviewKinds";
import { useAppConfig } from "@/features/workspace/hooks/useAppConfig";
import { useAiConfig } from "./aiConfig";
import { useT } from "@/i18n/useT";

const label = "mb-1 block text-[11px] text-[var(--ink-faint)]";

/** Panel shell: both popovers look the same (width, radius and shadow match the other dropdowns in the repo) */
export const reviewPanel =
  "w-[300px] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]";

/**
 * Whether review can start now: only if the backend's chosen model has a token configured (reported by aiReview in /api/config).
 *
 * Login / admin / rate limits are all checked server-side; don't guess for it here. Let it through
 * and let the server's 401 / 403 come back with its own explanation; more honest than the frontend guessing a reason.
 */
export function useReviewKeyReady(): { ready: boolean; hint: string } {
  const t = useT();
  const config = useAppConfig();
  return {
    ready: config?.aiReview === true,
    hint: t("AI 审核还没配置好：到管理后台的「AI 设置」里选模型、填 Key"),
  };
}

/** Review types: one per row, multi-select; a line under each name says what it checks */
function KindRows() {
  const t = useT();
  const [cfg, set] = useAiConfig();
  return (
    <div className="mb-2.5 flex flex-col gap-1">
      <span className={label}>{t("审核类型（可多选，一起审）")}</span>
      {REVIEW_KINDS.map((k) => {
        const on = cfg.kinds.includes(k.id);
        // Keep at least one type: the last checkbox can't be unchecked
        const last = on && cfg.kinds.length === 1;
        return (
          <label
            key={k.id}
            className={`flex cursor-pointer gap-2 rounded-md border px-2 py-1.5 transition-colors ${
              on
                ? "border-[var(--accent)] bg-[var(--accent-wash)]"
                : "border-[var(--hairline)] hover:bg-[var(--paper)]"
            }`}
          >
            {/* Native checkbox: multi-select semantics, space to toggle and screen reader support come for free */}
            <input
              type="checkbox"
              className="mt-[3px] shrink-0 accent-[var(--accent)]"
              checked={on}
              disabled={last}
              title={last ? t("至少要审一类") : undefined}
              onChange={() =>
                set({ kinds: on ? cfg.kinds.filter((id) => id !== k.id) : [...cfg.kinds, k.id] })
              }
            />
            <span className="min-w-0">
              <span
                className={`block text-[12px] ${on ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}
              >
                {t(k.label)}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-faint)]">
                {t(k.description)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** The whole form: currently just the review types */
export function ReviewSettingsFields() {
  return <KindRows />;
}
