import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const trash = params.get("trash") === "1";
  // full=1：附带正文，供本地优先的同步引擎一次拉全量镜像
  const full = params.get("full") === "1";
  const docs = await prisma.document.findMany({
    where: { userId: session.user.id, deletedAt: trash ? { not: null } : null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true, content: true, category: true },
  });
  if (full) {
    return NextResponse.json(docs);
  }
  // 列表附带纯文本摘要与字数，正文本身不下发
  return NextResponse.json(
    docs.map((d) => {
      const plain = d.content
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
        chars: d.content.replace(/\s/g, "").length,
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
