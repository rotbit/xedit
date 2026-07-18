import OSS from "ali-oss";

export function ossConfigured(): boolean {
  return Boolean(
    process.env.OSS_REGION &&
      process.env.OSS_ACCESS_KEY_ID &&
      process.env.OSS_ACCESS_KEY_SECRET &&
      process.env.OSS_BUCKET
  );
}

/** 上传 Buffer 到 OSS，返回可访问 URL（优先 CDN 域名） */
export async function ossPut(buffer: Buffer, ext: string, contentType: string): Promise<string> {
  const client = new OSS({
    region: process.env.OSS_REGION!,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    bucket: process.env.OSS_BUCKET!,
    secure: true,
  });

  const date = new Date();
  const dir = `xedit/${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const name = `${dir}/${crypto.randomUUID()}.${ext}`;
  const result = await client.put(name, buffer, { headers: { "Content-Type": contentType } });
  const cdn = process.env.OSS_CDN_DOMAIN?.replace(/\/$/, "");
  return cdn ? `${cdn}/${name}` : result.url.replace(/^http:/, "https:");
}
