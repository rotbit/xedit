"use client";

/**
 * 审核用哪家模型：供应商 / 模型 / API Key 三行，收在审核条右边的一个小面板里。
 *
 * 只管收设置，不管调用——存进本机（见 aiConfig.ts），下一次审核自然就用上了。
 * 改完关掉面板会顺手重跑一趟：不然用户改完模型还得自己再点一次「重新审核」，
 * 十有八九会以为没生效。
 */
import { useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { AI_PROVIDERS, aiProvider } from "@/lib/ai/providers";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { aiKeyOf, useAiConfig } from "./aiConfig";

const CUSTOM = "__custom";
const field =
  "w-full rounded-md border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]";
const label = "mb-1 block text-[11px] text-[var(--ink-faint)]";

export function ReviewAiSettings({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [cfg, set] = useAiConfig();
  const spec = aiProvider(cfg.provider)!;
  const panelRef = useRef<HTMLDivElement>(null);
  // 改过才值得重跑：只是打开看一眼就关掉的，不该白烧一次额度
  const dirty = useRef(false);
  const [customOn, setCustomOn] = useState(false);
  const custom = customOn || !spec.models.includes(cfg.model);

  const close = () => {
    onClose();
    if (dirty.current) onChanged();
  };
  useDismissMenu(panelRef, close, true);
  useEscape(close);

  const key = aiKeyOf(cfg);

  return (
    <div
      ref={panelRef}
      className="absolute right-4 top-9 z-30 w-[300px] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--ink)]">审核用的模型</span>
        <button
          className="cursor-pointer rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          title="收起"
          onClick={close}
        >
          <X size={13} />
        </button>
      </div>

      <div className="mb-2">
        <span className={label}>供应商</span>
        <select
          className={field}
          value={cfg.provider}
          onChange={(e) => {
            dirty.current = true;
            setCustomOn(false); // 换了一家，上一家的自定义模型名在这儿多半不存在
            set({ provider: e.target.value as typeof cfg.provider });
          }}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
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
            dirty.current = true;
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
            onChange={(e) => {
              dirty.current = true;
              set({ model: e.target.value });
            }}
          />
        ) : null}
      </div>

      <div className="mb-2">
        <span className={label}>API Key（{spec.keyHint}）</span>
        <input
          className={field}
          type="password"
          value={key}
          spellCheck={false}
          autoComplete="off"
          placeholder="粘贴你自己的 Key"
          onChange={(e) => {
            dirty.current = true;
            set({ keys: { [cfg.provider]: e.target.value } });
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">
        {key
          ? "Key 只存在这台电脑的浏览器里，审核时经本站服务端转发给模型，服务端不保存。"
          : "还没填 Key，现在审核给的是演示用的假意见。"}
        <a
          className="ml-1 inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
          href={spec.keyUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          去申请
          <ExternalLink size={9} />
        </a>
      </p>
    </div>
  );
}
