import OSS from "ali-oss";

// 媒体类型白名单与大小上限在 src/lib/media.ts（客户端也要用，不能依赖本文件的 ali-oss）

export function ossConfigured(): boolean {
  return Boolean(
    process.env.OSS_REGION &&
      process.env.OSS_ACCESS_KEY_ID &&
      process.env.OSS_ACCESS_KEY_SECRET &&
      process.env.OSS_BUCKET
  );
}

function client(): OSS {
  return new OSS({
    region: process.env.OSS_REGION!,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    bucket: process.env.OSS_BUCKET!,
    secure: true,
  });
}

export function ossUrlOf(key: string, fallback?: string): string {
  const cdn = process.env.OSS_CDN_DOMAIN?.replace(/\/$/, "");
  if (cdn) return `${cdn}/${key}`;
  if (fallback) return fallback.replace(/^http:/, "https:");
  return `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${key}`;
}

/** 生成对象 key：xedit/年月/uuid.ext */
export function ossObjectKey(ext: string): string {
  const date = new Date();
  const dir = `xedit/${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${dir}/${crypto.randomUUID()}.${ext}`;
}

/** 只有本服务签发的 key 才允许登记入库 */
export const OSS_KEY_PATTERN = /^xedit\/\d{6}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/** 上传 Buffer 到 OSS，返回可访问 URL 与对象 key */
export async function ossPut(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const key = ossObjectKey(ext);
  const result = await client().put(key, buffer, { headers: { "Content-Type": contentType } });
  return { url: ossUrlOf(key, result.url), key };
}

/** 签一个限时的 PUT 直传地址，浏览器凭它把文件直接发给 OSS（不经本服务中转） */
export function ossSignedPutUrl(key: string, contentType: string): string {
  return client().signatureUrl(key, {
    method: "PUT",
    "Content-Type": contentType,
    expires: 600,
  });
}

/** 读对象元信息；对象不存在返回 null（用来确认直传是否真的成功） */
export async function ossStat(key: string): Promise<{ size: number; mime: string } | null> {
  try {
    const res = await client().head(key);
    const headers = (res.res.headers ?? {}) as Record<string, string>;
    return {
      size: Number(headers["content-length"] ?? 0) || 0,
      mime: headers["content-type"] ?? "",
    };
  } catch {
    return null;
  }
}

/** 列出 xedit/ 前缀下的对象（最多 1000 个） */
export async function ossList(): Promise<{ key: string; size: number; lastModified: string }[]> {
  const result = await client().list(
    { prefix: "xedit/", "max-keys": 1000 },
    {}
  );
  return (result.objects ?? []).map((o) => ({
    key: o.name,
    size: o.size,
    lastModified: o.lastModified,
  }));
}

export async function ossDelete(key: string): Promise<void> {
  await client().delete(key);
}

/** 批量删除对象（删除账号时清理其全部素材）；OSS 单次上限 1000 个 */
export async function ossDeleteMany(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    await client().deleteMulti(keys.slice(i, i + 1000), { quiet: true });
  }
}
