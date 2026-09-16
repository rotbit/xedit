import { listLocalDocs } from "@/lib/localDocs";
import { listMirrorDocs } from "@/lib/docStore";
import type { DocMeta } from "../types";

/** 登录态的文章列表 = 云端镜像 + 未上云的本地文档，全部来自本地存储（离线可用） */
export function mergedCloudList(): DocMeta[] {
  return [...listLocalDocs(), ...listMirrorDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
