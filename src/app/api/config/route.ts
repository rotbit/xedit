import { NextResponse } from "next/server";
import { githubConfigured, googleConfigured, wechatConfigured } from "@/auth";
import { aiReviewReady } from "@/lib/ai/siteSettings";
import { coverGenerateConfigured } from "@/lib/coverGenerate/replicate";
import { ossConfigured } from "@/lib/oss";

/** 前端据此提示哪些能力尚未配置。除 aiReview 要问一下库（有内存缓存）外全是模块级常量 */
export async function GET() {
  // 库挂了不该连累整个配置接口：当作「审核还没配好」处理
  const aiReview = await aiReviewReady().catch(() => false);
  return NextResponse.json({
    github: githubConfigured,
    google: googleConfigured,
    wechat: wechatConfigured,
    // 判定口径与上传路径共用一处，别在这儿再抄一遍 OSS_* 清单
    oss: ossConfigured(),
    // 站点配没配生图 Token；这个账号开没开通 AI 生成封面另走 /api/me/permissions，接口自己也会拦
    coverGenerate: coverGenerateConfigured(),
    // AI 审核此刻能不能跑（后台选定的那家有没有 token）；只报一个布尔，用哪家、key 是什么都不下发
    aiReview,
  });
}
