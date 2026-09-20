/**
 * 一条意见此刻算什么状态——尽量从正文本身推，不另存一份会走样的副本。
 *
 * 只有「忽略」和「知道了」是纯粹的用户动作，必须记；「采纳」不记：
 * 采纳就是把 quote 换成了 suggestion，于是「quote 找不到了、suggestion 在原处」
 * 本身就是采纳的证据。这样 ⌘Z 撤销之后，quote 一回来这条意见自己就活过来了。
 */

import { locateInSource } from "./locate";
import type { ReviewAction, ReviewItem, ReviewStatus } from "./types";

export function deriveStatus(
  item: ReviewItem,
  source: string,
  action?: ReviewAction
): ReviewStatus {
  if (action === "ignored") return "ignored";
  if (locateInSource(source, item.quote, item.line)) {
    return action === "acked" ? "acked" : "open";
  }
  // quote 没了：是被换成建议了（采纳），还是作者自己改了（失效）
  if (item.suggestion && locateInSource(source, item.suggestion, item.line)) return "accepted";
  return "stale";
}

/** 还等着作者处理的：只有它们上高亮、参与上一条/下一条、算进分类计数 */
export function isOpen(status: ReviewStatus): boolean {
  return status === "open";
}

/** 已处理（顶栏计数里的「已处理 M」） */
export function isHandled(status: ReviewStatus): boolean {
  return status === "accepted" || status === "acked" || status === "ignored";
}
