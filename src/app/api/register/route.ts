import { NextResponse } from "next/server";
import { tk } from "@/i18n/t";

/** Explicitly retire the old API, including requests from cached or older clients. */
export function POST() {
  return NextResponse.json({ error: tk("本站仅支持第三方账号登录") }, { status: 410 });
}
