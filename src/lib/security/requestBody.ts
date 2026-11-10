import { tk } from "@/i18n/t";

/** Stop reading at the limit, including chunked responses whose Content-Length is absent or inaccurate. */
export async function readLimitedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(tk("文件过大"));
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Small metadata endpoints do not need the much larger media-upload body allowance. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  const bytes = await readLimitedBody(req.body, 32 * 1024);
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
