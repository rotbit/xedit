"use client";

/**
 * A gold conversion utility at /gold, unrelated to xedit's editing features; a standalone page for personal use.
 * The coefficient and conversion history are stored only in browser localStorage: no cloud, no per-account split, gone on a new device.
 * The coefficient isn't fetched online; the user enters it or picks a preset, so this page makes no requests.
 */
import { useState, useSyncExternalStore } from "react";

/** One conversion record: result text / coefficient in effect at the time / timestamp */
type Rec = { txt: string; c: number; t: number };

/** All persisted state */
type Saved = { coef: number; his: Rec[] };

const COEF_KEY = "goldCoef";
const HIS_KEY = "goldHis";
// 285 is just a starting value; the real coefficient moves with the market and the user adjusts it, don't treat it as an exact constant
const DEFAULT_COEF = 285;
// Four common presets, exactly filling the grid-cols-4 row below; adding/removing presets means changing the grid column count too
const PRESETS = [284, 284.5, 285, 285.5];
// Keep only 20 records: localStorage space is limited and nobody looks back at older results
const MAX_HIS = 20;
// The gold color on this page is hardcoded rather than a theme variable, same in light and dark; the same value also appears in INPUT_CLS and a few classes, so change them together
const GOLD = "#b8860b";
const DEFAULT_SAVED: Saved = { coef: DEFAULT_COEF, his: [] };

const INPUT_CLS =
  "w-full rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 py-2.5 text-[16px] text-[var(--ink)] outline-none transition-colors focus:border-[#b8860b]";

/** Accept only positive finite numbers; empty string, 0, negatives and garbage all mean "no input" */
function parsePositive(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** What's read from localStorage is unknown; validate each entry before narrowing to Rec[], dropping bad data */
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

/* ── localStorage as an external store subscription ──────────────
   The server snapshot gives defaults and the client snapshot gives stored values; after hydration React re-renders
   once on its own. That avoids a first-frame mismatch without calling setState in an effect (the repo's lint
   forbids it; see the same trade-off in src/hooks/useHydrated.ts). */

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
    return DEFAULT_SAVED; // storage disabled in private mode / corrupt JSON: use defaults
  }
}

/** The snapshot reference must be stable, or useSyncExternalStore re-renders forever */
function getSnapshot(): Saved {
  cache ??= readSaved();
  return cache;
}

function getServerSnapshot(): Saved {
  return DEFAULT_SAVED;
}

// This page is the only writer, so it doesn't listen for storage events: with two tabs open, their records won't sync with each other
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Persist and notify subscribers. Swap the cache before writing storage, so if the write fails (private mode) the UI still shows the new value. */
function save(next: Saved): void {
  cache = next;
  try {
    localStorage.setItem(COEF_KEY, String(next.coef));
    localStorage.setItem(HIS_KEY, JSON.stringify(next.his));
  } catch {
    // A failed write doesn't affect what's shown in this session
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

/** Pale gold result bar: body ink color when there's a result, faintest tone while waiting for input */
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

/** The whole converter page: coefficient card + two conversion-direction cards + local history. */
export function GoldCalculator() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { coef, his } = saved;
  // Draft for the coefficient input: null means "follow the coefficient in effect", saving a derived-state sync
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
    setDraft(null); // invalid input rolls straight back to the value in effect
    if (v !== null) applyCoef(v);
  };

  /** Record an entry on blur / Enter; skip if identical to the latest one to avoid flooding on repeated blur */
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
          {/* 1 Conversion coefficient */}
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
                // Presets have decimals and floats can't be compared for equality directly, so use a tiny epsilon to tell if one is selected
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

          {/* 2 NAV → price per gram */}
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

          {/* 3 Price per gram → implied NAV */}
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

          {/* 4 Conversion history */}
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
