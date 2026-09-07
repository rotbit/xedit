"use client";

import { useState, useSyncExternalStore } from "react";

/** 一条换算记录：结果文本 / 当时生效的系数 / 时间戳 */
type Rec = { txt: string; c: number; t: number };

/** 落盘的全部状态 */
type Saved = { coef: number; his: Rec[] };

const COEF_KEY = "goldCoef";
const HIS_KEY = "goldHis";
const DEFAULT_COEF = 285;
const PRESETS = [284, 284.5, 285, 285.5];
const MAX_HIS = 20;
const GOLD = "#b8860b";
const DEFAULT_SAVED: Saved = { coef: DEFAULT_COEF, his: [] };

const INPUT_CLS =
  "w-full rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 py-2.5 text-[16px] text-[var(--ink)] outline-none transition-colors focus:border-[#b8860b]";

/** 只接受正有限数，空串、0、负数、乱码一律当「没输入」 */
function parsePositive(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** localStorage 里读出来的是 unknown，逐条校验后才收敛成 Rec[]，脏数据直接丢 */
function toRecords(raw: unknown): Rec[] {
  if (!Array.isArray(raw)) return [];
  const out: Rec[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { txt, c, t } = item as Record<string, unknown>;
    if (typeof txt === "string" && typeof c === "number" && typeof t === "number") {
      out.push({ txt, c, t });
    }
  }
  return out.slice(0, MAX_HIS);
}

/* ── localStorage 当外部 store 订阅 ──────────────────────────────
   服务端快照给默认值、客户端快照给存储值，hydration 之后 React 自己补一次
   渲染。这样既不会首帧不一致，也不用在 effect 里 setState（本仓库 lint
   禁止，见 src/hooks/useHydrated.ts 里同样的取舍）。 */

let cache: Saved | null = null;
const listeners = new Set<() => void>();

function readSaved(): Saved {
  try {
    const rawHis = localStorage.getItem(HIS_KEY);
    return {
      coef: parsePositive(localStorage.getItem(COEF_KEY) ?? "") ?? DEFAULT_COEF,
      his: rawHis ? toRecords(JSON.parse(rawHis)) : [],
    };
  } catch {
    return DEFAULT_SAVED; // 隐私模式禁用存储 / JSON 损坏：走默认值
  }
}

/** 快照引用必须稳定，否则 useSyncExternalStore 会一直重渲染 */
function getSnapshot(): Saved {
  cache ??= readSaved();
  return cache;
}

function getServerSnapshot(): Saved {
  return DEFAULT_SAVED;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function save(next: Saved): void {
  cache = next;
  try {
    localStorage.setItem(COEF_KEY, String(next.coef));
    localStorage.setItem(HIS_KEY, JSON.stringify(next.his));
  } catch {
    // 写不进去不影响本次会话内的展示
  }
  for (const fn of listeners) fn();
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] p-4">
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[14px] font-medium text-[var(--ink)]">{children}</h2>;
}

/** 淡金底结果条：有结果时用正文墨色，等待输入时压到最淡一档 */
function Result({ text, waiting }: { text: string; waiting: boolean }) {
  return (
    <p
      className={`mt-3 rounded-[12px] bg-[#b8860b]/8 px-3 py-2.5 font-[family-name:var(--mono)] text-[14.5px] leading-relaxed ${
        waiting ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"
      }`}
    >
      {text}
    </p>
  );
}

export function GoldCalculator() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { coef, his } = saved;
  // 系数输入框的草稿：null 表示「跟随已生效的系数」，省掉一次派生态同步
  const [draft, setDraft] = useState<string | null>(null);
  const [nav, setNav] = useState("");
  const [gram, setGram] = useState("");

  const coefDraft = draft ?? String(coef);

  const applyCoef = (v: number) => {
    setDraft(null);
    if (v !== coef) save({ ...saved, coef: v });
  };

  const saveCoef = () => {
    const v = parsePositive(coefDraft);
    setDraft(null); // 无效输入直接回滚成当前生效值
    if (v !== null) applyCoef(v);
  };

  /** 失焦 / 回车时落一条记录；与最近一条完全相同则跳过，避免反复失焦刷屏 */
  const pushRecord = (txt: string) => {
    if (his[0]?.txt === txt) return;
    save({ ...saved, his: [{ txt, c: coef, t: Date.now() }, ...his].slice(0, MAX_HIS) });
  };

  const coefText = coef.toFixed(1);
  const navNum = parsePositive(nav);
  const gramNum = parsePositive(gram);
  const navResult =
    navNum === null ? null : `净值 ${navNum} × ${coefText} = ${(navNum * coef).toFixed(2)} 元/克`;
  const gramResult =
    gramNum === null ? null : `克价 ${gramNum} ÷ ${coefText} = 净值 ${(gramNum / coef).toFixed(4)}`;

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--paper)]">
      <div className="mx-auto max-w-[440px] px-4 py-6">
        <header className="mb-4">
          <h1 className="text-[20px] font-semibold" style={{ color: GOLD }}>
            易方达黄金换算器
          </h1>
          <p className="mt-1 text-[12px] text-[var(--ink-faint)]">基金净值与单克金价互相换算</p>
        </header>

        <div className="space-y-3">
          {/* 1 换算系数 */}
          <Card>
            <div className="flex items-baseline justify-between">
              <CardTitle>换算系数</CardTitle>
              <span className="font-[family-name:var(--mono)] text-[13px] text-[var(--ink-soft)]">
                当前：{coefText}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                step={0.1}
                inputMode="decimal"
                value={coefDraft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  saveCoef();
                  e.currentTarget.blur();
                }}
                className={INPUT_CLS}
                aria-label="换算系数"
              />
              <button
                type="button"
                onClick={saveCoef}
                className="shrink-0 rounded-[10px] px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: GOLD }}
              >
                保存
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PRESETS.map((v) => {
                const on = Math.abs(coef - v) < 1e-9;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => applyCoef(v)}
                    aria-pressed={on}
                    className={`rounded-[10px] border py-1.5 text-[13px] transition-colors ${
                      on
                        ? "border-transparent text-white"
                        : "border-[var(--hairline-strong)] text-[var(--ink-soft)] hover:border-[#b8860b]"
                    }`}
                    style={on ? { backgroundColor: GOLD } : undefined}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* 2 净值 → 单克价格 */}
          <Card>
            <CardTitle>净值 → 单克价格</CardTitle>
            <p className="mt-1 text-[11.5px] text-[var(--ink-faint)]">
              支付宝易方达，仅使用收盘确认净值
            </p>
            <input
              type="number"
              step={0.0001}
              inputMode="decimal"
              placeholder="例：2.7983"
              value={nav}
              onChange={(e) => setNav(e.target.value)}
              onKeyDown={blurOnEnter}
              onBlur={() => navResult && pushRecord(navResult)}
              className={`${INPUT_CLS} mt-3`}
              aria-label="单位净值"
            />
            <Result text={navResult ?? "等待输入净值"} waiting={navResult === null} />
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
              ⚠️ 不要使用盘中估值，仅交易日晚间确认净值有效；结果仅作估算参考，不构成投资建议
            </p>
          </Card>

          {/* 3 单克价格 → 反推净值 */}
          <Card>
            <CardTitle>单克价格 → 反推净值</CardTitle>
            <input
              type="number"
              step={0.01}
              inputMode="decimal"
              placeholder="例：797.52"
              value={gram}
              onChange={(e) => setGram(e.target.value)}
              onKeyDown={blurOnEnter}
              onBlur={() => gramResult && pushRecord(gramResult)}
              className={`${INPUT_CLS} mt-3`}
              aria-label="目标克价"
            />
            <Result text={gramResult ?? "等待输入克价"} waiting={gramResult === null} />
          </Card>

          {/* 4 换算记录 */}
          <Card>
            <CardTitle>换算记录（本地保存，最多 {MAX_HIS} 条）</CardTitle>
            {his.length === 0 ? (
              <p className="mt-3 text-[13px] text-[var(--ink-faint)]">暂无记录</p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--hairline)]">
                {his.map((r) => (
                  <li key={`${r.t}-${r.txt}`} className="py-2 first:pt-0">
                    <p className="font-[family-name:var(--mono)] text-[13px] text-[var(--ink)]">
                      {r.txt}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                      系数 {r.c.toFixed(1)} ｜ {new Date(r.t).toLocaleString("zh-CN")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => save({ ...saved, his: [] })}
              className="mt-3 w-full rounded-[10px] border border-[var(--hairline-strong)] py-2 text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[#b8860b] hover:text-[#b8860b]"
            >
              清空记录
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
