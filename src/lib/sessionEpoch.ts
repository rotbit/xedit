/**
 * 会话代际：换账号、登出、清镜像时 +1。
 * 所有异步落盘路径在发起时记下当时的代际，回来时代际变了就丢弃结果，
 * 上一个账号的在途请求不会写进下一个账号的本地状态。
 */
let epoch = 1;

export function getSessionEpoch(): number {
  return epoch;
}

export function bumpSessionEpoch(): number {
  return ++epoch;
}

/** 发起异步操作时记下，回来时用它判断结果是否还算数 */
export function isCurrentEpoch(captured: number): boolean {
  return captured === epoch;
}
