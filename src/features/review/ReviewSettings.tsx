"use client";

/**
 * 审核设置那张表：只选审核类型。
 *
 * 只有这一份。顶栏「审核」按钮弹出的启动面板（ReviewLaunchPopover）和审核条上
 * 那颗胶囊点开的面板（ReviewAiSettings）都嵌它——两处各写一遍的话，
 * 迟早会一处能选、另一处不能。
 *
 * 用哪家的哪个模型、key 是什么，都由管理员在后台的「AI 设置」里定，这里不给选也看不到。
 * 表单只管收设置，收完存进本机（见 aiConfig.ts），什么时候真去跑由外面的按钮说了算。
 */
import { useId } from "react";
import { REVIEW_KINDS } from "@/lib/ai/reviewKinds";
import { useAppConfig } from "@/features/workspace/hooks/useAppConfig";
import { useAiConfig } from "./aiConfig";

const label = "mb-1 block text-[11px] text-[var(--ink-faint)]";

/** 面板外壳：两处弹出的面板同一副样子（宽度、圆角、影子都跟仓库里其他下拉一致） */
export const reviewPanel =
  "w-[300px] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]";

/**
 * 现在能不能开审：后台选定的那家模型配了 token 才行（/api/config 的 aiReview 报出来的）。
 *
 * 登录 / 管理员 / 限量都在服务端判，这里不替它猜——放行，
 * 让服务端的 401 / 403 带着自己的说法回来，比前端猜一个理由诚实。
 */
export function useReviewKeyReady(): { ready: boolean; hint: string } {
  const config = useAppConfig();
  return {
    ready: config?.aiReview === true,
    hint: "AI 审核还没配置好：到管理后台的「AI 设置」里选模型、填 Key",
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

/** 整张表：现在只有审核类型一项 */
export function ReviewSettingsFields() {
  // 同一页上可能同时存在两份表单（极端情况下），radio 的 name 不能撞
  const name = useId();
  return (
    <>
      <KindRows name={name} />
    </>
  );
}
