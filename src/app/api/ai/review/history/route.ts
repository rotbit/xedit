import { NextResponse } from "next/server";
import { cleanDocId, listReviewRecords } from "@/lib/ai/reviewHistory";
import { historyUser } from "./guard";

/** 某篇文章的审核历史（只有摘要行，整份结果按 id 另取） */
export async function GET(req: Request) {
  const who = await historyUser();
  if ("response" in who) return who.response;
  const docId = cleanDocId(new URL(req.url).searchParams.get("docId"));
  if (!docId) {
    return NextResponse.json({ error: "bad_input", message: "缺少文章 id" }, { status: 400 });
  }
  try {
    return NextResponse.json({ records: await listReviewRecords(who.userId, docId) });
  } catch (e) {
    console.error("读审核历史失败", e instanceof Error ? e.name : e);
    return NextResponse.json({ error: "failed", message: "历史记录读不出来，稍后再试" }, { status: 500 });
  }
}
