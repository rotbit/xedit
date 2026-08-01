import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { touchDailyActive } from "@/lib/active";
import { wordCount } from "@/lib/wordCount";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  // 打开工作台必经此接口，作为 DAU 打点位；失败不影响响应
  void touchDailyActive(session.user.id);
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
          where: { userId: session.user.id, updatedAt: { gte: sinceDate } },
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
          where: { userId: session.user.id, deletedAt: null },
          select: { id: true },
        }),
      ]);
      return NextResponse.json({ docs: changed, ids: live.map((d) => d.id) });
    }
  }
  if (full) {
    const docs = await prisma.document.findMany({
      where: { userId: session.user.id, deletedAt: trash ? { not: null } : null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true, content: true, category: true },
    });
    return NextResponse.json(docs);
  }
  // 列表附带纯文本摘要与字数，正文本身不下发（进程内算完即丢，响应体积不随文章长度膨胀）。
  // 字数走 wordCount 统一口径，与阅读页/状态栏/统计一致。
  const docs = await prisma.document.findMany({
    where: { userId: session.user.id, deletedAt: trash ? { not: null } : null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, category: true, updatedAt: true, content: true },
  });
  return NextResponse.json(
    docs.map((d) => {
      const plain = d.content
        .slice(0, 2000)
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[#>*`~$|-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: d.id,
        title: d.title,
        category: d.category,
        updatedAt: d.updatedAt,
        excerpt: plain.slice(0, 90),
        chars: wordCount(d.content),
      };
    })
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const denied = await readOnlyGuard(session.user.id);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const doc = await prisma.document.create({
    data: {
      userId: session.user.id,
      title: typeof body.title === "string" && body.title ? body.title.slice(0, 200) : "未命名文章",
      content: typeof body.content === "string" ? body.content : "",
      category:
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim().slice(0, 100)
          : "未分类",
    },
  });
  return NextResponse.json(doc);
}
