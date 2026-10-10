/**
 * 「今天」页当日记录的云端读写（客户端见 src/lib/todos/dayLogSync.ts）。
 *
 * 事件 id 由客户端生成，(userId, id) 复合主键让重复推送天然幂等：
 * 响应丢了客户端再推一次，只会覆盖同一行。删除打 deletedAt 墓碑而不是真删，
 * 其它设备按 updatedAt 增量拉取时才能看到「这条没了」。
 */
import { NextResponse } from "next/server";
import type { DayLogEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId, serverError } from "@/lib/routeAuth";
import { tk } from "@/i18n/t";

/** 单次拉取上限：60 天的记录正常远到不了，满了客户端按 hasMore 接着翻 */
const PAGE = 2000;
/** 单次推送 upsert / delete 各自的上限，与客户端分批大小一致 */
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
 * 拉取。`?since=<ISO>`：updatedAt 之后的全部变动（含墓碑），供增量同步；
 * 没有游标时必须带 `?from=YYYY-MM-DD`：该日起未删除的记录，供首次全量。
 * 一律按 updatedAt 升序，cursor 取本批最大 updatedAt。
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
    // 多取一条用来判断还有没有下一页
    let rows = await prisma.dayLogEvent.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      take: PAGE + 1,
    });
    const hasMore = rows.length > PAGE;
    if (hasMore) {
      rows = rows.slice(0, PAGE);
      // 同一批写入的行 updatedAt 可能相同：游标是「严格大于」，若页尾截在一串同值中间，
      // 剩下那几条下一页就永远拉不到了。所以把页尾那串同值整体留给下一页
      // （整页都同值时没法这样退，只能照发——单次推送最多 400 行，正常到不了）
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
 * 校验一条事件；不合法返回 null（整条丢弃）。取舍：
 * - id / day / kind / ts 是定位与排序的根基，任一不对整条丢；
 * - text、title 是用户写的内容，超长截断保留——丢一整条记录比少几个字更糟；
 * - docId 超长只丢这个字段：截断后的 id 会指向错的文章，不如不关联；
 * - end / chars 不是有限数字就当没有。
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
    // 列是 INT4：四舍五入成整数并夹在范围内，防一个离谱的数把整批事务打挂
    chars:
      typeof e.chars === "number" && Number.isFinite(e.chars)
        ? Math.max(-2_000_000_000, Math.min(2_000_000_000, Math.round(e.chars)))
        : null,
    text: typeof e.text === "string" ? e.text.slice(0, MAX_TEXT) : null,
  };
}

/**
 * 推送：`{ upsert?: Event[], delete?: string[] }`，各最多 200 条，超出的截掉不报错
 * （客户端本来就按 200 分批，超出只可能是异常请求）。
 * upsert 覆盖全部字段并清掉墓碑；delete 只给已存在且未删的行打墓碑，不存在的 id 忽略——
 * 那多半是还没推上来就被删掉的记录，服务端不必知道它存在过。
 * 返回的 cursor 是本次写入行的最大 updatedAt，仅供参考：客户端不能拿它推进拉取游标，
 * 否则会跳过别的设备在这之前写入的记录。
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
    // 同一个事务：一批里 upsert 与墓碑要么全落、要么全不落，客户端据此整批清脏
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
        // deletedAt 为空才打：重复删除不刷新 updatedAt，免得其它设备反复拉到同一块墓碑。
        // updatedAt 显式写成 now，返回的 cursor 才和库里一致
        const { count } = await tx.dayLogEvent.updateMany({
          where: { userId, id: { in: deletes }, deletedAt: null },
          data: { deletedAt: now, updatedAt: now },
        });
        if (count > 0 && (!max || now > max)) max = now;
      }
      return max;
      // 默认 5 秒超时对 200 条逐行 upsert 偏紧（远端数据库每条一个往返），放宽到 15 秒
    }, { timeout: 15_000 });
    return NextResponse.json({ ok: true, cursor: latest ? latest.toISOString() : null });
  } catch (e) {
    return serverError(e, tk("保存当日记录失败"));
  }
}
