/**
 * Read/write the current user's preferences: theme, code theme, custom CSS, category list, sidebar order.
 * PUT is a field-by-field partial update: any field missing from the body or of the wrong type is not stored,
 * so the frontend can send just the one or two changed fields without fear of another tab editing other fields at the same time.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { sanitizeCustomThemes } from "@/lib/themes/custom";
import { tk } from "@/i18n/t";

/** Manual sidebar order: { items: { parentPath: [`c:childName` | `d:docId`…] } } is the current mixed sequence written,
 *  cats/docs are the two separate legacy sequences (parentPath→childName / category→docId), still accepted so old clients writing back don't lose data.
 *  Only accepts maps of string arrays, with caps on entries and total size; returns the serialized result, or null if invalid */
function sanitizeSidebarOrder(raw: unknown): string | null {
  const pickMap = (v: unknown): Record<string, string[]> => {
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string[]> = {};
    let entries = 0;
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      // These caps are anti-abuse hard limits, not business rules: normal users never come close to 500 folders; excess is silently dropped
      if (entries >= 500 || typeof k !== "string" || k.length > 100 || !Array.isArray(list)) {
        continue;
      }
      out[k] = list
        .filter((s): s is string => typeof s === "string" && s.length <= 100)
        .slice(0, 500);
      entries++;
    }
    return out;
  };
  const obj = raw as { items?: unknown; cats?: unknown; docs?: unknown };
  const clean = JSON.stringify({
    items: pickMap(obj.items),
    cats: pickMap(obj.cats),
    docs: pickMap(obj.docs),
  });
  // Over 256KB, the whole thing is discarded (returns null, so the caller skips the field): order data should never get that big
  return clean.length <= 256 * 1024 ? clean : null;
}

/** Read settings. Returns null if the user has never saved any, and the frontend uses defaults. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json(settings);
}

/** Partially update settings. Read-only accounts (banned, over quota) are stopped by readOnlyGuard before any write. */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const denied = await readOnlyGuard(session.user.id);
  if (denied) return denied;
  // A body parse failure is treated as an empty object: every field below checks its own type, so an empty object changes nothing
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | boolean> = {};
  if (typeof body.themeId === "string") data.themeId = body.themeId;
  if (typeof body.codeThemeId === "string") data.codeThemeId = body.codeThemeId;
  if (typeof body.customCss === "string") data.customCss = body.customCss;
  if (typeof body.macCode === "boolean") data.macCode = body.macCode;
  if (typeof body.linkFootnote === "boolean") data.linkFootnote = body.linkFootnote;
  if (Array.isArray(body.customThemes)) {
    data.customThemes = JSON.stringify(sanitizeCustomThemes(body.customThemes));
  }
  if (Array.isArray(body.categories)) {
    // Cap matches the document category field (100 chars): the old cut at 50 truncated deep Feishu-import paths into phantom categories
    const list = body.categories
      .filter((c: unknown): c is string => typeof c === "string" && Boolean(c.trim()))
      .map((c: string) => c.trim().slice(0, 100))
      .slice(0, 400);
    // In UserSettings this is a text column storing a JSON string; dedupe while we're at it so repeated frontend writes don't pile up duplicates
    data.categories = JSON.stringify(Array.from(new Set(list)));
  }
  if (body.sidebarOrder && typeof body.sidebarOrder === "object") {
    const clean = sanitizeSidebarOrder(body.sidebarOrder);
    if (clean) data.sidebarOrder = clean;
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });
  return NextResponse.json(settings);
}
