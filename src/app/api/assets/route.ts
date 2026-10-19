import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { ossConfigured, ossList, ossUrlOf } from "@/lib/oss";
import { MIME_BY_EXT } from "@/lib/media";
import { tk } from "@/i18n/t";

/**
 * Asset list. kind/q are ordinary where filters, but filter=unused is different:
 * its rule matches [id]/usage, both substring-match the object key in bodies (so old links still hit after a CDN domain change);
 * change one, change the other. The difference: usage checks a single asset via the DB's contains, while this checks all assets:
 * references have no separate table (the body is one blob of Markdown/HTML), so all of the user's bodies and
 * all assets are pulled into memory for substring matching, costing assets × total body length. At single-user scale (a few hundred assets,
 * a few MB of bodies in total) that's milliseconds, and it spares us a separate reference index table for the image library;
 * if we ever reach a scale that needs pagination, replace this with a key → documentId reference table.
 */

/** Max items returned for the unused list in one go: enough for a screen of cleanup, and stops extreme accounts from blowing up the response */
const UNUSED_MAX_ITEMS = 500;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const q = (searchParams.get("q") ?? "").trim();
  const where: Prisma.AssetWhereInput = {
    userId,
    // Images/videos split by mime prefix; an unrecognized kind is treated as absent
    ...(kind === "image" || kind === "video" ? { mime: { startsWith: `${kind}/` } } : {}),
    ...(q ? { key: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const limitParam = searchParams.get("limit");

  // Unused: full comparison returned all at once, no pagination (cursor pagination is meaningless for in-memory filtering).
  // This is a new parameter with no legacy callers, so it returns { items, total, nextCursor } whether or not limit is passed
  if (searchParams.get("filter") === "unused") {
    const [docs, assets] = await Promise.all([
      // Trashed articles count as references too: they may be restored, so keeping the asset is safer
      prisma.document.findMany({ where: { userId }, select: { content: true } }),
      prisma.asset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    const contents = docs.map((d) => d.content);
    const unused = assets.filter((a) => !contents.some((c) => c.includes(a.key)));
    return NextResponse.json({
      items: unused.slice(0, UNUSED_MAX_ITEMS),
      total: unused.length,
      nextCursor: null,
    });
  }

  // Without limit, keep the old full-array shape so legacy callers like the desktop app are unaffected
  if (!limitParam) {
    const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json(assets);
  }
  const limit = Math.min(Math.max(Number(limitParam) || 24, 1), 100);
  const cursor = searchParams.get("cursor");
  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      // createdAt can repeat within the same second, so add id as a tiebreaker for stable cursor order
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.asset.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    items,
    total,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

/** Sync OSS history files: register objects under the xedit/ prefix that aren't in the DB to the current account.
 *  This claims every orphan object in the whole bucket for the caller, which with multiple users means privilege escalation + bypassing quota,
 *  so it's super-admin only (a data migration tool from the single-user era). */
export async function POST() {
  const session = await auth();
  const userId = adminSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: tk("仅管理员可同步 OSS 历史文件") }, { status: 403 });
  }
  if (!ossConfigured()) {
    return NextResponse.json({ error: tk("服务端未配置 OSS") }, { status: 501 });
  }
  const [objects, existing] = await Promise.all([
    ossList(),
    prisma.asset.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const known = new Set(existing.map((e) => e.key));
  const mimeOf = (key: string): string =>
    MIME_BY_EXT[key.split(".").pop()?.toLowerCase() ?? ""] ?? "";
  const fresh = objects.filter((o) => !known.has(o.key) && mimeOf(o.key));
  if (fresh.length > 0) {
    await prisma.asset.createMany({
      data: fresh.map((o) => ({
        userId,
        key: o.key,
        url: ossUrlOf(o.key),
        size: o.size,
        mime: mimeOf(o.key),
        source: "upload",
      })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ added: fresh.length });
}
