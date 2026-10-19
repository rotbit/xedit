import { NextResponse } from "next/server";
import { githubConfigured, googleConfigured, wechatConfigured } from "@/auth";
import { aiReviewReady } from "@/lib/ai/siteSettings";
import { coverGenerateConfigured } from "@/lib/coverGenerate/replicate";
import { ossConfigured } from "@/lib/oss";

/** Tells the frontend which capabilities aren't configured yet. All module-level constants except aiReview, which asks the DB (memory-cached) */
export async function GET() {
  // A DB outage shouldn't take down the whole config API: treat it as "review not configured yet"
  const aiReview = await aiReviewReady().catch(() => false);
  return NextResponse.json({
    github: githubConfigured,
    google: googleConfigured,
    wechat: wechatConfigured,
    // Same check as the upload path; don't copy the OSS_* list here again
    oss: ossConfigured(),
    // Whether the site has an image-generation token; whether this account may AI-generate covers is via /api/me/permissions, and the API enforces it too
    coverGenerate: coverGenerateConfigured(),
    // Whether AI review can run right now (does the admin-selected provider have a token); only a boolean, never which provider or key
    aiReview,
  });
}
