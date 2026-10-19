/**
 * Review history requests: list, fetch one, record actions, delete one (API at /api/ai/review/history).
 *
 * Same temperament as aiReview.ts: pure functions, no React, no toasts; errors are thrown with a message fit for the user (t() it again where displayed so constants like OFFLINE follow the language).
 */
import { getLocale, htmlLang, type Locale } from "@/i18n/locale";
import { t, tk, translate } from "@/i18n/t";
import { asRecordMeta, type ReviewRun } from "./aiReview";
import type { ReviewAction, ReviewRecordMeta, ReviewResult } from "./types";

const API = "/api/ai/review/history";
const OFFLINE = tk("现在连不上服务器，稍后再试");

async function call(url: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(OFFLINE);
  }
  const data = (await res.json().catch(() => null)) as { message?: unknown } | null;
  if (!res.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : t("请求失败（{status}）", { status: res.status }));
  }
  return data;
}

/** Which review runs this document has had, newest first */
export async function listReviewHistory(
  docId: string,
  signal?: AbortSignal
): Promise<ReviewRecordMeta[]> {
  const data = (await call(`${API}?docId=${encodeURIComponent(docId)}`, { signal })) as {
    records?: unknown;
  } | null;
  const rows = Array.isArray(data?.records) ? data.records : [];
  return rows.map(asRecordMeta).filter((r): r is ReviewRecordMeta => r !== null);
}

/** Fetch an old review run: the result + the 「忽略 / 知道了」 (Ignore / Got it) actions taken back then */
export async function loadReviewRecord(
  id: string,
  signal?: AbortSignal
): Promise<ReviewRun & { actions: Record<string, ReviewAction> }> {
  const data = (await call(`${API}/${encodeURIComponent(id)}`, { signal })) as {
    result?: Partial<ReviewResult>;
    actions?: Record<string, ReviewAction>;
  } | null;
  const record = asRecordMeta(data);
  const result = data?.result;
  if (!record || !result || !Array.isArray(result.items) || !Array.isArray(result.categories)) {
    throw new Error(tk("这条审核记录读不出来"));
  }
  return {
    record,
    result: {
      summary: typeof result.summary === "string" ? result.summary : "",
      categories: result.categories,
      items: result.items,
    },
    actions: data?.actions && typeof data.actions === "object" ? data.actions : {},
  };
}

/** Record 「忽略 / 知道了」 on this run (overwrites the whole set) */
export async function saveReviewActions(
  id: string,
  actions: Record<string, ReviewAction>
): Promise<void> {
  await call(`${API}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions }),
  });
}

export async function deleteReviewRecord(id: string): Promise<void> {
  await call(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Time in the list: today shows only the time, this year omits the year */
export function formatRecordTime(iso: string, now = new Date(), locale: Locale = getLocale()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return translate("今天 {time}", locale, { time: hm });
  const sameYear = d.getFullYear() === now.getFullYear();
  if (locale === "en") {
    // English month names go to Intl: same year "Aug 3 14:30", other years "Dec 31, 2025"
    const fmt = new Intl.DateTimeFormat(htmlLang(locale), {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    return sameYear ? `${fmt.format(d)} ${hm}` : fmt.format(d);
  }
  const md = `${d.getMonth() + 1}月${d.getDate()}日`; // i18n-ignore Chinese date format; English uses Intl above
  return sameYear ? `${md} ${hm}` : `${d.getFullYear()}年${md}`; // i18n-ignore
}
