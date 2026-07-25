/**
 * 行级文本 diff（LCS 回溯）：用于版本历史预览的改动标注。
 * 先掐掉公共前后缀行，只对中间段做 DP；规模超限时退化为整段替换，保证不卡界面。
 */

export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/** DP 矩阵上限（约 8MB Int32）：版本 diff 掐头去尾后极少触顶 */
const MAX_DP_CELLS = 2_000_000;

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (oldText === newText) return a.map((text) => ({ type: "same", text }));

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const same = (text: string): DiffLine => ({ type: "same", text });
  const mid =
    lcsDiff(a.slice(start, endA), b.slice(start, endB)) ?? [
      ...a.slice(start, endA).map((text): DiffLine => ({ type: "del", text })),
      ...b.slice(start, endB).map((text): DiffLine => ({ type: "add", text })),
    ];
  return [...a.slice(0, start).map(same), ...mid, ...a.slice(endA).map(same)];
}

/** 标准 LCS 动态规划 + 回溯；矩阵过大时返回 null，由调用方整段替换兜底 */
function lcsDiff(a: string[], b: string[]): DiffLine[] | null {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text) => ({ type: "add", text }));
  if (m === 0) return a.map((text) => ({ type: "del", text }));
  if (n * m > MAX_DP_CELLS) return null;

  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i] === b[j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}
