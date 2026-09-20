/**
 * 审核历史的那几个请求：列表、取一条、记动作、删一条（接口见 /api/ai/review/history）。
 *
 * 和 aiReview.ts 一个脾气：纯函数，不认识 React，也不弹提示；出错就抛，message 能直接给用户看。
 */
import { asRecordMeta, type ReviewRun } from "./aiReview";
import type { ReviewAction, ReviewRecordMeta, ReviewResult } from "./types";

const API = "/api/ai/review/history";
const OFFLINE = "现在连不上服务器，稍后再试";

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
    throw new Error(typeof data?.message === "string" ? data.message : `请求失败（${res.status}）`);
  }
  return data;
}

/** 这篇文章审过哪几趟，新的在前 */
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

/** 翻出一趟旧审核：结果 + 当时按过的「忽略 / 知道了」 */
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
    throw new Error("这条审核记录读不出来");
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

/** 把「忽略 / 知道了」记到这一趟上（整份覆盖） */
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

/** 列表里的时间：今天的只说几点，今年的不带年份 */
export function formatRecordTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === now.getFullYear() ? `${md} ${hm}` : `${d.getFullYear()}年${md}`;
}
