import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";
import { AI_PROVIDERS, aiProvider } from "@/lib/ai/providers";
import { MAX_GUIDE_CHARS, reviewFormatRules } from "@/lib/ai/reviewPrompt";
import {
  AI_KEY_SLOTS,
  AiSettingError,
  aiKeyStatuses,
  getReviewModel,
  reviewGuideStatuses,
  setAiKey,
  setReviewGuide,
  setReviewModel,
} from "@/lib/ai/siteSettings";
import { tk } from "@/i18n/t";

/**
 * Admin 「AI 设置」 (AI settings): which model site-wide AI review uses, each upstream provider's token, and each review type's prompt.
 *
 * Tokens are write-only: PUT takes plaintext and stores it encrypted; GET returns only "source + last four",
 * and the full token is never sent back to the browser or logged under any circumstances.
 */

async function guard() {
  return adminSessionUserId(await auth());
}
const forbidden = () => NextResponse.json({ error: tk("无权访问") }, { status: 403 });

async function snapshot() {
  const [review, keys, guides] = await Promise.all([
    getReviewModel(),
    aiKeyStatuses(),
    reviewGuideStatuses(),
  ]);
  return {
    review,
    providers: AI_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      models: p.models,
      slot: p.envKey,
    })),
    keys,
    // Prompts: the editable 「审核要求」 (review requirements) + the read-only 「输出格式」 (output format), which the server always appends
    prompts: guides.map((g) => ({ ...g, formatRules: reviewFormatRules(g.kind) })),
    promptMaxChars: MAX_GUIDE_CHARS,
  };
}

export async function GET() {
  if (!(await guard())) return forbidden();
  return NextResponse.json(await snapshot());
}

interface Body {
  provider?: unknown;
  model?: unknown;
  /** Slot → plaintext token; empty string = clear the admin-entered one; absent slots are untouched */
  keys?: unknown;
  /** Review type → full 「审核要求」 text; empty string = restore default; absent types are untouched */
  prompts?: unknown;
}

export async function PUT(req: Request) {
  if (!(await guard())) return forbidden();
  const body = (await req.json().catch(() => ({}))) as Body;

  try {
    if (body.keys && typeof body.keys === "object") {
      for (const [slot, value] of Object.entries(body.keys as Record<string, unknown>)) {
        if (!AI_KEY_SLOTS.includes(slot) || typeof value !== "string") {
          return NextResponse.json({ error: tk("认不出这个 key 槽位") }, { status: 400 });
        }
        await setAiKey(slot, value);
      }
    }
    if (body.prompts && typeof body.prompts === "object") {
      for (const [kind, text] of Object.entries(body.prompts as Record<string, unknown>)) {
        if (typeof text !== "string") {
          return NextResponse.json({ error: tk("提示词得是一段文字") }, { status: 400 });
        }
        await setReviewGuide(kind, text);
      }
    }
    if (body.provider !== undefined) {
      const provider = aiProvider(body.provider);
      if (!provider) return NextResponse.json({ error: tk("认不出这个 AI 供应商") }, { status: 400 });
      await setReviewModel(provider, body.model);
    }
  } catch (e) {
    if (e instanceof AiSettingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // DB errors may contain the entire write statement; log only the name, never send it to the browser
    console.error("保存 AI 设置失败", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: tk("保存失败，稍后再试") }, { status: 500 });
  }
  return NextResponse.json(await snapshot());
}
