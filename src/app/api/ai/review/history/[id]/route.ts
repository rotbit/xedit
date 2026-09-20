import { NextResponse } from "next/server";
import { deleteReviewRecord, getReviewRecord, setReviewActions } from "@/lib/ai/reviewHistory";
import { historyUser, notFound } from "../guard";

type Ctx = { params: Promise<{ id: string }> };

const failed = (what: string, e: unknown) => {
  console.error(what, e instanceof Error ? e.name : e);
  return NextResponse.json({ error: "failed", message: "操作失败，稍后再试" }, { status: 500 });
};

/** 取一条记录的整份结果 */
export async function GET(_req: Request, { params }: Ctx) {
  const who = await historyUser();
  if ("response" in who) return who.response;
  try {
    const record = await getReviewRecord(who.userId, (await params).id);
    return record ? NextResponse.json(record) : notFound();
  } catch (e) {
    return failed("读审核记录失败", e);
  }
}

/** 记下「忽略 / 知道了」：请求体 { actions: { 意见 id: "ignored" | "acked" } }，整份覆盖 */
export async function PATCH(req: Request, { params }: Ctx) {
  const who = await historyUser();
  if ("response" in who) return who.response;
  const body = (await req.json().catch(() => null)) as { actions?: unknown } | null;
  try {
    const ok = await setReviewActions(who.userId, (await params).id, body?.actions);
    return ok ? NextResponse.json({ ok: true }) : notFound();
  } catch (e) {
    return failed("存审核动作失败", e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await historyUser();
  if ("response" in who) return who.response;
  try {
    const ok = await deleteReviewRecord(who.userId, (await params).id);
    return ok ? NextResponse.json({ ok: true }) : notFound();
  } catch (e) {
    return failed("删审核记录失败", e);
  }
}
