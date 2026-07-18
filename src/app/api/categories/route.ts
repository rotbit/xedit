import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const UNCATEGORIZED = "未分类";

/**
 * 分类批量操作：
 * - rename: 该分类下所有文章改名，自建分类列表同步
 * - remove: 该分类下文章并入「未分类」，从自建分类列表移除
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const action: string = body?.action;
  const from: string = typeof body?.from === "string" ? body.from.trim() : "";
  const to: string = typeof body?.to === "string" ? body.to.trim().slice(0, 50) : "";

  if (!from || (action === "rename" && !to)) {
    return NextResponse.json({ error: "参数缺失" }, { status: 400 });
  }
  if (action !== "rename" && action !== "remove") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }

  const target = action === "rename" ? to : UNCATEGORIZED;
  await prisma.document.updateMany({
    where: { userId, category: from },
    data: { category: target },
  });

  // 同步自建分类列表
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  let categories: string[] = [];
  try {
    categories = JSON.parse(settings?.categories ?? "[]");
  } catch {
    categories = [];
  }
  categories = categories.filter((c) => c !== from);
  if (action === "rename" && !categories.includes(to)) categories.push(to);
  await prisma.userSettings.upsert({
    where: { userId },
    update: { categories: JSON.stringify(categories) },
    create: { userId, categories: JSON.stringify(categories) },
  });

  return NextResponse.json({ ok: true });
}
