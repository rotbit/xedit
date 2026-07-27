import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";

const UNCATEGORIZED = "未分类";

/**
 * 分类批量操作（支持「父/子」多级路径，重命名/删除会级联到子分类）：
 * - rename: 该路径及其子孙路径整体改名，自建分类列表同步
 * - remove: 该路径子树下的文章并入「未分类」，自建分类移除子树
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const action: string = body?.action;
  const from: string = typeof body?.from === "string" ? body.from.trim() : "";
  const to: string = typeof body?.to === "string" ? body.to.trim().slice(0, 100) : "";

  if (!from || (action === "rename" && !to)) {
    return NextResponse.json({ error: "参数缺失" }, { status: 400 });
  }
  if (action !== "rename" && action !== "remove") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }

  // 命中该路径及其子孙的文章
  const affected = await prisma.document.findMany({
    where: {
      userId,
      OR: [{ category: from }, { category: { startsWith: `${from}/` } }],
    },
    select: { id: true, category: true },
  });

  const mapTo = (cat: string): string =>
    action === "remove" ? UNCATEGORIZED : cat === from ? to : to + cat.slice(from.length);

  // 按目标分类分组批量更新
  const groups = new Map<string, string[]>();
  for (const a of affected) {
    const target = mapTo(a.category);
    const list = groups.get(target) ?? [];
    list.push(a.id);
    groups.set(target, list);
  }
  for (const [target, ids] of groups) {
    await prisma.document.updateMany({
      where: { id: { in: ids } },
      data: { category: target },
    });
  }

  // 同步自建分类列表（子树整体处理）
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  let categories: string[] = [];
  try {
    categories = JSON.parse(settings?.categories ?? "[]");
  } catch {
    categories = [];
  }
  const inSubtree = (c: string) => c === from || c.startsWith(`${from}/`);
  if (action === "remove") {
    categories = categories.filter((c) => !inSubtree(c));
  } else {
    categories = categories.map((c) =>
      inSubtree(c) ? (c === from ? to : to + c.slice(from.length)) : c
    );
    if (!categories.includes(to)) categories.push(to);
    categories = Array.from(new Set(categories));
  }
  await prisma.userSettings.upsert({
    where: { userId },
    update: { categories: JSON.stringify(categories) },
    create: { userId, categories: JSON.stringify(categories) },
  });

  return NextResponse.json({ ok: true });
}
