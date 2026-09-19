import { NextResponse } from "next/server";
import { githubConfigured, googleConfigured, wechatConfigured } from "@/auth";
import { coverGenerateConfigured } from "@/lib/coverGenerate/replicate";
import { ossConfigured } from "@/lib/oss";

/** 前端据此提示哪些能力尚未配置。全是模块级常量，没有 await，不必是 async */
export function GET() {
  return NextResponse.json({
    github: githubConfigured,
    google: googleConfigured,
    wechat: wechatConfigured,
    // 判定口径与上传路径共用一处，别在这儿再抄一遍 OSS_* 清单
    oss: ossConfigured(),
    // 站点配没配生图 Token；能不能用还要看是不是管理员，那一层由接口自己拦
    coverGenerate: coverGenerateConfigured(),
  });
}
