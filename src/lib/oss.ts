import OSS from "ali-oss";

// Media type allowlist and size limits live in src/lib/media.ts (the client needs them too and can't depend on this file's ali-oss)

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

/** Generate an object key: xedit/yearmonth/uuid.ext */
export function ossObjectKey(ext: string): string {
  const date = new Date();
  const dir = `xedit/${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${dir}/${crypto.randomUUID()}.${ext}`;
}

/** Only keys issued by this service may be registered in the database */
export const OSS_KEY_PATTERN = /^xedit\/\d{6}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/** Upload a Buffer to OSS, returning the accessible URL and object key */
export async function ossPut(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const key = ossObjectKey(ext);
  const result = await client().put(key, buffer, { headers: { "Content-Type": contentType } });
  return { url: ossUrlOf(key, result.url), key };
}

/** Sign a time-limited PUT URL so the browser sends the file straight to OSS (no relay through this service) */
export function ossSignedPutUrl(key: string, contentType: string): string {
  return client().signatureUrl(key, {
    method: "PUT",
    "Content-Type": contentType,
    expires: 600,
  });
}

/** Read object metadata; null if the object doesn't exist (used to confirm a direct upload really succeeded) */
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

/** List objects under the xedit/ prefix (up to 1000) */
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

/** Batch-delete objects (cleans up all of an account's assets on deletion); OSS caps a single call at 1000 */
export async function ossDeleteMany(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    await client().deleteMulti(keys.slice(i, i + 1000), { quiet: true });
  }
}
