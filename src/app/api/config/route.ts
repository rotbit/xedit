import { NextResponse } from "next/server";
import { githubConfigured, googleConfigured } from "@/auth";

/** 前端据此提示哪些能力尚未配置 */
export async function GET() {
  return NextResponse.json({
    github: githubConfigured,
    google: googleConfigured,
    oss: Boolean(
      process.env.OSS_REGION &&
        process.env.OSS_ACCESS_KEY_ID &&
        process.env.OSS_ACCESS_KEY_SECRET &&
        process.env.OSS_BUCKET
    ),
  });
}
