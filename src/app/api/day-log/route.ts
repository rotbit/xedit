/**
 * Cloud read/write for the 「今天」 (Today) page's daily log (client side: src/lib/todos/dayLogSync.ts).
 *
 * Event ids are client-generated, and the (userId, id) composite key makes repeated pushes naturally idempotent:
 * if the response is lost and the client pushes again, it just overwrites the same row. Deletes set a deletedAt tombstone instead of hard-deleting,
 * so other devices pulling incrementally by updatedAt can see "this one is gone".
 */
import { NextResponse } from "next/server";
import type { DayLogEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId, serverError } from "@/lib/routeAuth";
import { tk } from "@/i18n/t";

/** Per-pull cap: 60 days of records normally come nowhere near it; if full, the client keeps paging via hasMore */
const PAGE = 2000;
/** Separate caps for upsert / delete per push, matching the client's batch size */
const BATCH = 200;
const KINDS = new Set(["write", "create", "version", "task"]);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ID = 64;
const MAX_TEXT = 1000;
const MAX_TITLE = 300;

function badRequest() {
  return NextResponse.json({ error: tk("参数错误") }, { status: 400 });
}

function toClient(e: DayLogEvent) {
  return {
    id: e.id,
    day: e.day,
    ts: e.ts.getTime(),
    end: e.end ? e.end.getTime() : null,
    kind: e.kind,
    docId: e.docId,
    title: e.title,
    chars: e.chars,
    text: e.text,
    deleted: e.deletedAt !== null,
    updatedAt: e.updatedAt.toISOString(),
  };
}

/**
 * Pull. `?since=<ISO>`: every change after updatedAt (including tombstones), for incremental sync;
 * without a cursor, `?from=YYYY-MM-DD` is required: undeleted records from that day on, for the initial full load.
 * Always ordered by updatedAt ascending; cursor is the batch's max updatedAt.
 */
export async function GET(req: Request) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const params = new URL(req.url).searchParams;
  const since = params.get("since");
  const from = params.get("from");
  let where;
  if (since !== null) {
    const date = new Date(since);
    if (Number.isNaN(date.getTime())) return badRequest();
    where = { userId, updatedAt: { gt: date } };
  } else if (from !== null && DAY_RE.test(from)) {
    where = { userId, day: { gte: from }, deletedAt: null };
  } else {
    return badRequest();
  }
  try {
    // Fetch one extra to tell whether there's a next page
    let rows = await prisma.dayLogEvent.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      take: PAGE + 1,
    });
    const hasMore = rows.length > PAGE;
    if (hasMore) {
      rows = rows.slice(0, PAGE);
      // Rows written in the same batch may share an updatedAt: the cursor is "strictly greater than", so if a page ends mid-run of equal values,
      // the rest of that run could never be fetched on the next page. So the trailing run of equal values is left whole for the next page
      // (if the entire page has the same value we can't back off, so it's sent as-is; a single push is at most 400 rows, normally unreachable)
      const boundary = rows[rows.length - 1].updatedAt.getTime();
      const trimmed = rows.filter((r) => r.updatedAt.getTime() !== boundary);
      if (trimmed.length > 0) rows = trimmed;
    }
    const cursor = rows.length > 0 ? rows[rows.length - 1].updatedAt.toISOString() : null;
    return NextResponse.json({ events: rows.map(toClient), cursor, hasMore });
  } catch (e) {
    return serverError(e, tk("读取当日记录失败"));
  }
}

interface CleanEvent {
  id: string;
  day: string;
  ts: Date;
  end: Date | null;
  kind: string;
  docId: string | null;
  title: string | null;
  chars: number | null;
  text: string | null;
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;

/**
 * Validate one event; returns null if invalid (the whole event is dropped). Trade-offs:
 * - id / day / kind / ts are the basis for locating and ordering; if any is wrong, drop the whole event;
 * - text and title are user content, so overlong values are truncated and kept: losing a whole record is worse than losing a few characters;
 * - an overlong docId drops just that field: a truncated id would point to the wrong article, better to not link at all;
 * - end / chars that aren't finite numbers are treated as absent.
 */
function cleanEvent(raw: unknown): CleanEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!isId(e.id) || typeof e.day !== "string" || !DAY_RE.test(e.day)) return null;
  if (typeof e.kind !== "string" || !KINDS.has(e.kind)) return null;
  if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) return null;
  const ts = new Date(e.ts);
  if (Number.isNaN(ts.getTime())) return null;
  const end = typeof e.end === "number" && Number.isFinite(e.end) ? new Date(e.end) : null;
  return {
    id: e.id,
    day: e.day,
    ts,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
    kind: e.kind,
    docId: isId(e.docId) ? e.docId : null,
    title: typeof e.title === "string" ? e.title.slice(0, MAX_TITLE) : null,
    // The column is INT4: round to an integer and clamp to range so one absurd number can't crash the whole transaction
    chars:
      typeof e.chars === "number" && Number.isFinite(e.chars)
        ? Math.max(-2_000_000_000, Math.min(2_000_000_000, Math.round(e.chars)))
        : null,
    text: typeof e.text === "string" ? e.text.slice(0, MAX_TEXT) : null,
  };
}

/**
 * Push: `{ upsert?: Event[], delete?: string[] }`, at most 200 each; excess is truncated without error
 * (the client already batches by 200, so excess can only be an abnormal request).
 * upsert overwrites all fields and clears the tombstone; delete tombstones only existing undeleted rows and ignores unknown ids:
 * those are most likely records deleted before they were pushed, and the server needn't know they ever existed.
 * The returned cursor is the max updatedAt of rows written this time, for reference only: the client must not advance its pull cursor with it,
 * or it would skip records other devices wrote before this.
 */
export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { upsert?: unknown; delete?: unknown } | null;
  if (!body || typeof body !== "object") return badRequest();
  const upserts = Array.isArray(body.upsert)
    ? body.upsert
        .slice(0, BATCH)
        .map(cleanEvent)
        .filter((e): e is CleanEvent => e !== null)
    : [];
  const deletes = Array.isArray(body.delete) ? body.delete.slice(0, BATCH).filter(isId) : [];

  try {
    const now = new Date();
    // One transaction: a batch's upserts and tombstones all land or none do, and the client clears dirty state for the whole batch accordingly
    const latest = await prisma.$transaction(async (tx) => {
      let max: Date | null = null;
      for (const { id, ...fields } of upserts) {
        const row = await tx.dayLogEvent.upsert({
          where: { userId_id: { userId, id } },
          update: { ...fields, deletedAt: null },
          create: { userId, id, ...fields },
          select: { updatedAt: true },
        });
        if (!max || row.updatedAt > max) max = row.updatedAt;
      }
      if (deletes.length > 0) {
        // Only set when deletedAt is null: repeated deletes don't bump updatedAt, so other devices don't keep pulling the same tombstone.
        // updatedAt is explicitly set to now so the returned cursor matches the DB
        const { count } = await tx.dayLogEvent.updateMany({
          where: { userId, id: { in: deletes }, deletedAt: null },
          data: { deletedAt: now, updatedAt: now },
        });
        if (count > 0 && (!max || now > max)) max = now;
      }
      return max;
      // The default 5s timeout is tight for 200 row-by-row upserts (one round trip each to a remote DB), so relax it to 15s
    }, { timeout: 15_000 });
    return NextResponse.json({ ok: true, cursor: latest ? latest.toISOString() : null });
  } catch (e) {
    return serverError(e, tk("保存当日记录失败"));
  }
}
