/**
 * 内容指纹：只用来判断「这段文本还是上次那段吗」，不做安全用途。
 * cyrb53 在 JS 里快得多（一遍 charCodeAt + imul），53 位有效位对一个文库的正文量足够散。
 */

/** cyrb53：返回 16 进制串，同一段文本在任何平台上都是同一个值 */
export function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
