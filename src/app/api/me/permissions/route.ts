import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sessionPermissions } from "@/lib/permissions";

/**
 * Which features the current account can actually use (admin = all on, banned = all off; already computed in lib/permissions).
 * The frontend uses this to decide whether to show entry points; the real gate is in each API, this is only for the UI.
 * Not being logged in isn't an error, it returns an empty list; always query the DB, never cache, so permissions revoked in admin take effect immediately.
 */
export async function GET() {
  const permissions = await sessionPermissions(await auth());
  return NextResponse.json({ permissions }, { headers: { "Cache-Control": "no-store" } });
}
