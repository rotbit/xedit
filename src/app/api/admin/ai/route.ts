import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";
import { AI_PROVIDERS, aiProvider } from "@/lib/ai/providers";
import {
  AI_KEY_SLOTS,
  AiSettingError,
  aiKeyStatuses,
  getReviewModel,
  setAiKey,
  setReviewModel,
} from "@/lib/ai/siteSettings";

/**
 * 管理后台的「AI 设置」：全站 AI 审核用哪个模型、各家上游的 token。
 *
 * token 只进不出：PUT 收明文、加密入库；GET 只回「来源 + 末四位」，
 * 任何情况下都不把完整 token 发回浏览器，也不打进日志。
 */

async function guard() {
  return adminSessionUserId(await auth());
}
const forbidden = () => NextResponse.json({ error: "无权访问" }, { status: 403 });

async function snapshot() {
  const [review, keys] = await Promise.all([getReviewModel(), aiKeyStatuses()]);
  return {
    review,
    providers: AI_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      models: p.models,
      slot: p.envKey,
    })),
    keys,
  };
}

export async function GET() {
  if (!(await guard())) return forbidden();
  return NextResponse.json(await snapshot());
}

interface Body {
  provider?: unknown;
  model?: unknown;
  /** 槽位 → 明文 token；空串 = 清掉后台填的那份；没出现的槽位不动 */
  keys?: unknown;
}

export async function PUT(req: Request) {
  if (!(await guard())) return forbidden();
  const body = (await req.json().catch(() => ({}))) as Body;

  try {
    if (body.keys && typeof body.keys === "object") {
      for (const [slot, value] of Object.entries(body.keys as Record<string, unknown>)) {
        if (!AI_KEY_SLOTS.includes(slot) || typeof value !== "string") {
          return NextResponse.json({ error: "认不出这个 key 槽位" }, { status: 400 });
        }
        await setAiKey(slot, value);
      }
    }
    if (body.provider !== undefined) {
      const provider = aiProvider(body.provider);
      if (!provider) return NextResponse.json({ error: "认不出这个 AI 供应商" }, { status: 400 });
      await setReviewModel(provider, body.model);
    }
  } catch (e) {
    if (e instanceof AiSettingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // 库的报错里可能带着整条写入语句，只报个名字进日志，不往浏览器吐
    console.error("保存 AI 设置失败", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "保存失败，稍后再试" }, { status: 500 });
  }
  return NextResponse.json(await snapshot());
}
