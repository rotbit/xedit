import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { tk } from "@/i18n/t";

/**
 * Bulk category operations (supports multi-level 「父/子」 (parent/child) paths; rename/delete cascade to subcategories):
 * - rename: rename the path and all descendant paths, syncing the custom category list
 * - remove: articles under the path's subtree move to 「未分类」 (Uncategorized); the subtree is removed from custom categories
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const userId = session.user.id;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  // The request body is external, so type it unknown and validate each field; typing it string only fools the compiler
  const action: unknown = body?.action;
  const from: string = typeof body?.from === "string" ? body.from.trim() : "";
  const to: string = typeof body?.to === "string" ? body.to.trim().slice(0, 100) : "";

  if (action !== "rename" && action !== "remove") {
    return NextResponse.json({ error: tk("不支持的操作") }, { status: 400 });
  }
  if (!from || (action === "rename" && !to)) {
    return NextResponse.json({ error: tk("参数缺失") }, { status: 400 });
  }

  // Articles matching the path or its descendants
  const affected = await prisma.document.findMany({
    where: {
      userId,
      OR: [{ category: from }, { category: { startsWith: `${from}/` } }],
    },
    select: { id: true, category: true },
  });

  const mapTo = (cat: string): string =>
    action === "remove" ? UNCATEGORIZED : cat === from ? to : to + cat.slice(from.length);

  // Batch update grouped by target category
  const groups = new Map<string, string[]>();
  for (const a of affected) {
    const target = mapTo(a.category);
    const list = groups.get(target) ?? [];
    list.push(a.id);
    groups.set(target, list);
  }
  // Recategorizing articles and saving the custom category list must succeed or fail together: a mid-way failure leaves
  // an unfixable half state where "articles are renamed but the sidebar categories are old", so it's all one transaction
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [target, ids] of groups) {
    ops.push(
      prisma.document.updateMany({
        where: { id: { in: ids } },
        data: { category: target },
      })
    );
  }

  // Sync the custom category list (whole subtree at once)
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
  ops.push(
    prisma.userSettings.upsert({
      where: { userId },
      update: { categories: JSON.stringify(categories) },
      create: { userId, categories: JSON.stringify(categories) },
    })
  );
  await prisma.$transaction(ops);

  return NextResponse.json({ ok: true });
}
