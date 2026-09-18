import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId } from "@/lib/routeAuth";
import { touchDailyActive } from "@/lib/active";
import { createDocumentRow, listDocuments } from "@/lib/documents";

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  // 打开工作台必经此接口，作为 DAU 打点位；失败不影响响应
  void touchDailyActive(userId);
  const params = new URL(req.url).searchParams;
  const trash = params.get("trash") === "1";
  // full=1：附带正文，供本地优先的同步引擎一次拉全量镜像
  const full = params.get("full") === "1";
  // since=<ISO>：增量同步——只回传该时刻之后有变动的文档（含软删，靠 deletedAt 标记），
  // 另附全量存活 id 供客户端对账彻底删除。文库大了以后，每次切回前台的同步不再全量下发正文。
  const since = params.get("since");
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      const [changed, live] = await Promise.all([
        prisma.document.findMany({
          // gte 而非 gt：游标边界上的文档宁可多发一次，客户端落镜像是幂等的
          where: { userId, updatedAt: { gte: sinceDate } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            content: true,
            category: true,
            deletedAt: true,
          },
        }),
        prisma.document.findMany({
          where: { userId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      return NextResponse.json({ docs: changed, ids: live.map((d) => d.id) });
    }
  }
  if (full) {
    const docs = await prisma.document.findMany({
      where: { userId, deletedAt: trash ? { not: null } : null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true, content: true, category: true },
    });
    return NextResponse.json(docs);
  }
  // 列表附带纯文本摘要与字数，正文本身不下发（进程内算完即丢，响应体积不随文章长度膨胀）。
  // 摘要与字数的口径都在服务层，MCP 的 list_documents 拿到的是同一份形状；
  // limit="all" 是这里和 MCP 唯一的区别——前端侧栏要整份文库，不能被默认上限截断。
  return NextResponse.json(await listDocuments(userId, { trash, limit: "all" }));
}

/** 新建文章。走服务层的 createDocumentRow（不是 createDocument）：前端要拿整行落本地镜像，
 *  createDocument 只回 id/title/category 三个字段（MCP 用不着更多）。
 *  字段裁剪与 clientKey 去重都在服务层，REST 与 MCP 两条通道不会漂。 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  // clientKey 可选：离线新建、弱网重试会把同一条「新建」发好几遍，
  // 带同一个 key 的重发只落一篇，后到的拿回先落的那篇（不带则行为照旧）
  const doc = await createDocumentRow(userId, {
    title: body.title,
    content: body.content,
    category: body.category,
    clientKey: body.clientKey,
  });
  return NextResponse.json(doc);
}
