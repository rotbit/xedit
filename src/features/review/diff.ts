/**
 * 「原文 → 建议」的行内小 diff：卡片上要让人一眼看出到底改了哪几个字。
 *
 * 只掐公共前后缀，中间一整段算「删了 A 换成 B」——审核意见本来就是短句级的改写，
 * 上一套 Myers 既看不出差别，又要多养一份代码。
 */

export interface QuoteDiff {
  /** 没动的开头 */
  prefix: string;
  /** 划掉的部分（可能是空串：纯插入） */
  removed: string;
  /** 新增的部分（可能是空串：纯删除） */
  added: string;
  /** 没动的结尾 */
  suffix: string;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

export function diffQuote(before: string, after: string): QuoteDiff {
  const max = Math.min(before.length, after.length);

  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  // 别把一对代理项（emoji 之类）从中间劈开
  if (head > 0 && isHighSurrogate(before.charCodeAt(head - 1))) head--;

  let tail = 0;
  while (
    tail < max - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  if (tail > 0 && isLowSurrogate(before.charCodeAt(before.length - tail))) tail--;

  return {
    prefix: before.slice(0, head),
    removed: before.slice(head, before.length - tail),
    added: after.slice(head, after.length - tail),
    suffix: tail ? before.slice(before.length - tail) : "",
  };
}
