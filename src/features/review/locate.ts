/**
 * 审核意见的「对位」纯函数：在源码里找引文、意见卡片的避让排版。
 *
 * 为什么一律按引文文字找，而不是记字符偏移：意见是异步算出来的，回来时作者可能已经
 * 在别处改过几个字，任何偏移都废了；而引文本身只要还在，作者一眼就知道说的是哪一句。
 * line 只当提示用（同一句话在全文出现好几次时挑离它最近的那处），找不到就退到全文搜。
 */

export interface SourceSpan {
  from: number;
  to: number;
}

/**
 * 在 Markdown 源码里找引文，返回字符区间；找不到返回 null（= 原文已被改过）。
 *
 * 同一段文字出现多次时取离 lineHint 最近的那一处。行号是边扫边数的：
 * 每次只从上一处匹配接着往后数换行，整篇最多走一遍，不会退化成「每命中一次重数全文」。
 *
 * @param lineHint 0 基行号，与渲染结果里的 data-line 同一口径
 */
export function locateInSource(source: string, quote: string, lineHint: number): SourceSpan | null {
  if (!quote) return null;
  let best: SourceSpan | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  let scanned = 0;
  let line = 0;
  for (let at = source.indexOf(quote); at !== -1; at = source.indexOf(quote, at + 1)) {
    while (scanned < at) {
      if (source.charCodeAt(scanned) === 10) line++;
      scanned++;
    }
    const dist = Math.abs(line - lineHint);
    if (dist < bestDist) {
      bestDist = dist;
      best = { from: at, to: at + quote.length };
    }
    if (dist === 0) break; // 正落在提示行上，不可能有更近的了
  }
  return best;
}

/**
 * 意见卡片的避让排版（Word 批注栏那套）。
 *
 * 每张卡都想贴着自己引文的高度站，站不下就往下让：
 * - 常规情况下后来的被前面的顶下去，顺序不变；
 * - 选中的那张享有特权，回到它自己的锚点，上方的卡片依次往上挤给它让位；
 * - 上方实在挤不下（顶到 0 了），只好让选中的那张也往下走——位置不够就是不够。
 *
 * @param anchors 每张卡想站的位置（相对卡片列顶端）
 * @param heights 每张卡的实际高度，与 anchors 一一对应
 * @param active  选中卡的下标，没有选中传 -1
 * @param gap     卡片之间的最小间距
 */
export function layoutCards(
  anchors: number[],
  heights: number[],
  active: number,
  gap: number
): number[] {
  const n = anchors.length;
  if (n === 0) return [];
  const tops = anchors.map((t) => Math.max(0, t));

  /** 从 from 起顺着往下压平重叠 */
  const pushDown = (from: number) => {
    for (let i = Math.max(1, from); i < n; i++) {
      tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + gap);
    }
  };
  pushDown(1);
  if (active < 0 || active >= n) return tops;

  tops[active] = Math.max(0, anchors[active]);
  for (let i = active - 1; i >= 0; i--) {
    tops[i] = Math.min(tops[i], tops[i + 1] - heights[i] - gap);
  }
  if (tops[0] < 0) {
    // 上方让不出这么多空间：顶端归零，重新顺着压一遍（选中的那张也跟着被顶下去）
    tops[0] = 0;
    pushDown(1);
  } else {
    for (let i = active + 1; i < n; i++) {
      tops[i] = Math.max(Math.max(0, anchors[i]), tops[i - 1] + heights[i - 1] + gap);
    }
  }
  return tops;
}
