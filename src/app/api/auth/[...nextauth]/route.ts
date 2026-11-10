import { handlers } from "@/auth";
import type { NextRequest } from "next/server";
import { clientAddress, takeRateLimit, tooManyRequests } from "@/lib/security/rateLimit";

/** Rate-limit OAuth starts/callbacks, but keep ordinary session reads and logout available. */
async function handle(req: NextRequest) {
  const path = new URL(req.url).pathname;
  if (/\/(signin|callback)\//.test(path)) {
    const retry = await takeRateLimit("oauth-login", clientAddress(req), 60, 300);
    if (retry) return tooManyRequests(retry);
  }
  return req.method === "POST" ? handlers.POST(req) : handlers.GET(req);
}

export { handle as GET, handle as POST };
