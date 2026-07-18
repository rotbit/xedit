import OSS from "ali-oss";

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

/** 上传 Buffer 到 OSS，返回可访问 URL 与对象 key */
export async function ossPut(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const date = new Date();
  const dir = `xedit/${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const key = `${dir}/${crypto.randomUUID()}.${ext}`;
  const result = await client().put(key, buffer, { headers: { "Content-Type": contentType } });
  return { url: ossUrlOf(key, result.url), key };
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
