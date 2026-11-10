import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tk } from "@/i18n/t";

let nextCleanup = 0;

/** Only trust a header explicitly configured for an ingress that overwrites it. Otherwise share a global bucket. */
export function clientAddress(req: Request): string {
  const header = process.env.CLIENT_IP_HEADER;
  const value = header ? req.headers.get(header)?.split(",")[0].trim() : "";
  return value && isIP(value) ? value : "shared";
}

/** Atomic, persistent counters prevent parallel requests and multiple app instances from bypassing a limit. */
export async function takeRateLimit(scope: string, identity: string, limit: number, seconds: number): Promise<number> {
  const now = Date.now();
  const window = Math.floor(now / (seconds * 1000));
  const expiresAt = new Date((window + 1) * seconds * 1000);
  const key = createHash("sha256").update(`${scope}:${identity}:${window}`).digest("hex");
  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  if (now >= nextCleanup) {
    nextCleanup = now + 3600_000;
    void prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
      .catch(() => { nextCleanup = 0; });
  }
  return row.count > limit ? Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) : 0;
}

export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json({ error: tk("操作太频繁，请稍后重试") }, {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
  });
}
