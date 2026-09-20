"use client";

/**
 * 审核设置那张表：审核类型 + 供应商 + 模型。
 *
 * 只有这一份。顶栏「审核」按钮弹出的启动面板（ReviewLaunchPopover）和审核条上
 * 那颗胶囊点开的面板（ReviewAiSettings）都嵌它——两处各写一遍的话，
 * 迟早会一处能选、另一处不能。
 *
 * 这里没有填 key 的地方：各家的 key 全配在服务端，前端只选模型。
 * 表单只管收设置，收完存进本机（见 aiConfig.ts），什么时候真去跑由外面的按钮说了算。
 */
import { useId, useState } from "react";
import { AI_PROVIDERS, aiProvider } from "@/lib/ai/providers";
import { REVIEW_KINDS } from "@/lib/ai/reviewKinds";
import { useAppConfig } from "@/features/workspace/hooks/useAppConfig";
import { useAiConfig } from "./aiConfig";

const CUSTOM = "__custom";
const field =
  "w-full rounded-md border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]";
const label = "mb-1 block text-[11px] text-[var(--ink-faint)]";

/** 面板外壳：两处弹出的面板同一副样子（宽度、圆角、影子都跟仓库里其他下拉一致） */
export const reviewPanel =
  "w-[300px] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]";

/**
 * 这家现在能不能开审：站点给这家配了 key 才行（/api/config 的 aiProviders 报出来的）。
 *
 * 登录 / 管理员 / 限量都在服务端判，这里不替它猜——放行，
 * 让服务端的 401 / 403 带着自己的说法回来，比前端猜一个理由诚实。
 */
export function useReviewKeyReady(): { ready: boolean; hint: string } {
  const [cfg] = useAiConfig();
  const config = useAppConfig();
  const spec = aiProvider(cfg.provider)!;
  const siteHasKey = config?.aiProviders?.includes(cfg.provider) ?? false;
  return {
    ready: siteHasKey,
    hint: `站点还没有配置 ${spec.label} 的 Key，换一家试试`,
  };
}

/** 审核类型：一类一行，名字底下一句话说清楚它看的是什么 */
function KindRows({ name }: { name: string }) {
  const [cfg, set] = useAiConfig();
  return (
    <div className="mb-2.5 flex flex-col gap-1">
      <span className={label}>审核类型</span>
      {REVIEW_KINDS.map((k) => {
        const on = cfg.kind === k.id;
        return (
          <label
            key={k.id}
            className={`flex cursor-pointer gap-2 rounded-md border px-2 py-1.5 transition-colors ${
              on
                ? "border-[var(--accent)] bg-[var(--accent-wash)]"
                : "border-[var(--hairline)] hover:bg-[var(--paper)]"
            }`}
          >
            {/* 用原生 radio：单选语义、上下键切换、读屏都是白给的 */}
            <input
              type="radio"
              name={name}
              className="mt-[3px] shrink-0 accent-[var(--accent)]"
              checked={on}
              onChange={() => set({ kind: k.id })}
            />
            <span className="min-w-0">
              <span
                className={`block text-[12px] ${on ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}
              >
                {k.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-faint)]">
                {k.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** 供应商 / 模型两行 */
function ModelRows() {
  const [cfg, set] = useAiConfig();
  const spec = aiProvider(cfg.provider)!;
  const [customOn, setCustomOn] = useState(false);
  const custom = customOn || !spec.models.includes(cfg.model);
  // 服务端没配 key 的那几家留着但写明「未配置」，省得选了才发现用不了
  const ready = useAppConfig()?.aiProviders ?? [];

  return (
    <>
      <div className="mb-2">
        <span className={label}>供应商</span>
        <select
          className={field}
          value={cfg.provider}
          onChange={(e) => {
            setCustomOn(false); // 换了一家，上一家的自定义模型名在这儿多半不存在
            set({ provider: e.target.value as typeof cfg.provider });
          }}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {ready.includes(p.id) ? "" : "（未配置）"}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2">
        <span className={label}>模型</span>
        <select
          className={field}
          value={custom ? CUSTOM : cfg.model}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomOn(true);
              return;
            }
            setCustomOn(false);
            set({ model: e.target.value });
          }}
        >
          {spec.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {/* 各家随时会上新（Replicate 尤其勤），留个自己填的口子，不用等这份清单更新 */}
          <option value={CUSTOM}>自定义…</option>
        </select>
        {custom ? (
          <input
            className={`${field} mt-1.5`}
            value={cfg.model}
            spellCheck={false}
            placeholder={spec.models[0]}
            onChange={(e) => set({ model: e.target.value })}
          />
        ) : null}
      </div>

    </>
  );
}

/** 整张表：审核类型在上（先决定审什么），模型在下 */
export function ReviewSettingsFields() {
  // 同一页上可能同时存在两份表单（极端情况下），radio 的 name 不能撞
  const name = useId();
  return (
    <>
      <KindRows name={name} />
      <ModelRows />
    </>
  );
}
