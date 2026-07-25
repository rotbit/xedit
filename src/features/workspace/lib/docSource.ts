import { listLocalDocs } from "@/lib/localDocs";
import { listMirrorDocs } from "@/lib/docStore";
import type { DocMeta } from "../types";

/** 登录态的文章列表 = 云端镜像 + 未上云的本地文档，全部来自本地存储（离线可用） */
export function mergedCloudList(): DocMeta[] {
  return [...listLocalDocs(), ...listMirrorDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** 列表时间戳的口语化展示：一天内走相对时间，更早显示日期 */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
