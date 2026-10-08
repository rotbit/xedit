/**
 * 英文字典：各命名空间合并成一张表。按目录分文件只是为了好维护（单文件不超 500 行），
 * 运行时 key 全局唯一——同一句中文到处都该是同一个译法，重复了说明有一处是多余的。
 */
import { common } from "./common";
import { editor } from "./editor";
import { workspace } from "./workspace";

const namespaces: Record<string, Record<string, string>> = { common, workspace, editor };

function merge(): Record<string, string> {
  const out: Record<string, string> = {};
  const from: Record<string, string> = {};
  for (const [ns, dict] of Object.entries(namespaces)) {
    for (const [k, v] of Object.entries(dict)) {
      if (Object.hasOwn(out, k) && process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] duplicate en key ${JSON.stringify(k)} in ${from[k]} and ${ns}`);
      }
      out[k] = v;
      from[k] = ns;
    }
  }
  return out;
}

export const en: Record<string, string> = merge();
