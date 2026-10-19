/**
 * AI-generated WeChat covers: the server uses the site's Replicate token to generate the image and returns it to the page as a dataURL.
 * The token is used only here; it never appears in responses, logs, or error text (there's also a final scrub in case the upstream echoes it back).
 * Images aren't written to disk: the cover ends up traveling with the document (saved to the library or uploaded to OSS), so a server copy would just pile up temp files nobody cleans.
 */
import { tk } from "@/i18n/t";
const API_BASE = "https://api.replicate.com/";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const POLL_MS = 1500;
const RUNNING = ["starting", "processing"];
/** The cheapest per-image tier, a few seconds each; to switch models just change REPLICATE_MODEL */
const DEFAULT_MODEL = "black-forest-labs/flux-schnell";
const DEFAULT_TIMEOUT_SEC = 90;
const DEFAULT_DAILY_LIMIT = 20;

/** Color whitelist: users pick a swatch on the page instead of describing a color */
export const COVER_COLORS = ["blue", "orange", "green", "purple", "red", "teal", "gray"] as const;
export type CoverColor = (typeof COVER_COLORS)[number];

/** Color key → the phrase written into the prompt. The page keeps its own CSS colors, which only control swatch appearance */
const COLOR_PHRASE: Record<CoverColor, string> = {
  blue: "蓝色", // i18n-ignore color phrase written into the image prompt
  orange: "暖橙 / 陶土色", // i18n-ignore color phrase written into the image prompt
  green: "绿色", // i18n-ignore color phrase written into the image prompt
  purple: "紫色", // i18n-ignore color phrase written into the image prompt
  red: "红色", // i18n-ignore color phrase written into the image prompt
  teal: "青色", // i18n-ignore color phrase written into the image prompt
  gray: "深灰", // i18n-ignore color phrase written into the image prompt
};

/** Length cap per field: longer input just steers the model off course and crowds out the rest of the template */
const MAX_TITLE = 100;
const MAX_NAME = 40;
const MAX_HIGHLIGHT = 30;
/** Max highlight words: the template only leaves two lines, and more can't all stand out anyway */
const MAX_HIGHLIGHTS = 2;

/** Default ratio: flux-schnell accepts it and it's wide enough to look like a banner. Models that reject it get swapped by the adaptation below */
const DEFAULT_ASPECT = "21:9";
/** Optional inputs that can be dropped if a model rejects them; only prompt is truly required */
const OPTIONAL_INPUT = ["num_outputs", "output_format", "output_quality"] as const;
/** Max retries for input adaptation: upstream names one field per attempt, so there must be a limit to avoid looping forever */
const MAX_INPUT_RETRY = 3;

/**
 * Remember what each model accepts after hitting a 422: which aspect_ratio value to use and which optional fields not to send.
 * Every Replicate model has a different input schema (21:9 works on flux-schnell; another model returns 422),
 * so instead of hardcoding another value, remember the last version that worked per model so later requests don't hit the 422 first.
 * In process memory only and lost on restart; losing it just costs one more 422.
 */
const MODEL_INPUT = new Map<string, { aspectRatio?: string; drop: Set<string> }>();

/** For unit tests: reset the module-level cache (so tests don't contaminate each other) */
export function __resetCoverModelsForTests() {
  MODEL_INPUT.clear();
}

/** Failure codes: the route maps them to HTTP status, the page uses them to choose the message */
export type CoverErrorCode =
  | "no_token"
  | "bad_input"
  | "bad_token"
  | "billing"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "network"
  | "failed";

/** Failure with an error code. message is a sentence safe to show users and guaranteed not to contain the token */
export class CoverError extends Error {
  code: CoverErrorCode;
  constructor(code: CoverErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Whether the site has AI cover generation configured (/api/config uses this to tell the page if the feature exists) */
export function coverGenerateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
}

/** Max generations per account per calendar day; missing or invalid values default to 20 */
export function coverDailyLimit(): number {
  const n = Number(process.env.COVER_GENERATE_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

const clip = (s: unknown, n: number): string => {
  const text = String(s ?? "");
  return text.length > n ? `${text.slice(0, n)}…` : text;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sanitize each field before it goes into the template: control chars and newlines become spaces (the template is multi-line and user newlines would scramble it),
 * 「」 are removed (the template uses them as field delimiters), then whitespace is collapsed, ends trimmed, and the value truncated to the cap.
 */
export function cleanSlot(value: unknown, max: number): string {
  // Non-strings count as empty: String({}) would become "[object Object]" and leak into the prompt
  return (typeof value === "string" ? value : "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[「」]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Unknown color keys fall back to dark gray: color is a nice-to-have, not worth failing the whole request over a typo */
export function coverColor(value: unknown): CoverColor {
  return (COVER_COLORS as readonly unknown[]).includes(value) ? (value as CoverColor) : "gray";
}

/** An empty name means that side wasn't filled in (product B is optional on the page anyway) */
function cleanProduct(value: unknown): CoverProduct | null {
  const raw = (value ?? {}) as { name?: unknown; color?: unknown };
  const name = cleanSlot(raw.name, MAX_NAME);
  return name ? { name, color: coverColor(raw.color) } : null;
}

/**
 * Sanitize the request fields into the form the template uses directly. Only the title is required: without it the template is just a pile of constraints
 * and the image has nothing to do with the document. Products are optional; with none, it's a title-only cover with geometric visuals on the right;
 * if only product B is filled, treat it as product A (single card). The accent color comes from product A's swatch, even if its name is empty.
 */
export function coverFields(req: CoverRequest): CoverFields {
  const title = cleanSlot(req.title, MAX_TITLE);
  if (!title) throw new CoverError("bad_input", tk("标题是空的，先给文章起个标题"));
  const accent = coverColor(((req.left ?? {}) as { color?: unknown }).color);
  let left = cleanProduct(req.left);
  let right = cleanProduct(req.right);
  if (!left && right) [left, right] = [right, null];
  const highlights = (Array.isArray(req.highlights) ? req.highlights : [])
    .map((one) => cleanSlot(one, MAX_HIGHLIGHT))
    .filter((one) => one !== "")
    .slice(0, MAX_HIGHLIGHTS);
  return {
    title,
    highlights,
    accent,
    ...(left ? { left } : {}),
    ...(right ? { right } : {}),
  };
}

/**
 * The prompt is a hardcoded Chinese template; callers can only fill a few blanks and can't change the layout or the list of "don'ts".
 * The number of products decides whether the right side is a comparison, a single card, or geometric visuals (zero products); the lines that vary are decided inline below.
 * aspect is the ratio actually being sent this time (swapped if the model rejects 21:9), so the prompt and the input never disagree.
 */
export function buildPrompt(fields: CoverFields, aspect = DEFAULT_ASPECT): string {
  const { title, highlights, accent, left, right } = fields;
  const colorOf = (p: CoverProduct) => COLOR_PHRASE[p.color];
  return [
    `设计一张微信公众号文章封面，比例 ${aspect}，整体风格为：极简、干净、高级、科技感、产品评测感。`, // i18n-ignore image-generation prompt template
    "背景以纯白 / 极浅灰白为主，带非常轻微的柔和渐变，不要深色背景，不要花哨，不要复杂插画。整体大量留白，画面清爽。", // i18n-ignore image-generation prompt template
    "版式采用左右结构：", // i18n-ignore image-generation prompt template
    `左侧约占 45%，放标题文字；右侧约占 45%，${ // i18n-ignore image-generation prompt template
      left // i18n-ignore image-generation prompt template
        ? `放产品 / 模型${right ? "对比视觉" : "视觉"}` // i18n-ignore image-generation prompt template
        : "放抽象的科技感几何视觉（淡色圆弧、圆形色块、柔和光晕），不放产品卡片，不放 Logo" // i18n-ignore image-generation prompt template
    }；中间保留适当呼吸空间。`, // i18n-ignore image-generation prompt template
    "标题区域要有明显层次：", // i18n-ignore image-generation prompt template
    ...(left // i18n-ignore image-generation prompt template
      ? ["- 第一行放品牌或模型名称，字号中等偏大", "- 第二、第三行放核心标题，字号更大、更粗"] // i18n-ignore image-generation prompt template
      : ["- 前两三行放核心标题，字号大、粗"]), // i18n-ignore image-generation prompt template
    "- 最重要的关键词用品牌主题色突出", // i18n-ignore image-generation prompt template
    "- 其余文字使用接近黑色的深灰", // i18n-ignore image-generation prompt template
    "- 行距宽松，不要把文字挤在一起", // i18n-ignore image-generation prompt template
    "- 不要塞很多小字，不要参数列表，不要功能清单", // i18n-ignore image-generation prompt template
    // Zero products: no cards or logo on the right, so drop the card lines entirely // i18n-ignore image-generation prompt template
    ...(left // i18n-ignore image-generation prompt template
      ? [ // i18n-ignore image-generation prompt template
          right // i18n-ignore image-generation prompt template
            ? "右侧使用两个圆角卡片 / 产品卡片形成对比关系。" // i18n-ignore image-generation prompt template
            : "右侧使用一张圆角产品卡片作为视觉主体。", // i18n-ignore image-generation prompt template
          "卡片背景为白色，有非常轻微的阴影和淡淡的品牌色光晕。", // i18n-ignore image-generation prompt template
          right ? "每张卡片只保留：" : "卡片只保留：", // i18n-ignore image-generation prompt template
          "Logo + 品牌名 / 模型名。", // i18n-ignore image-generation prompt template
        ] // i18n-ignore image-generation prompt template
      : []), // i18n-ignore image-generation prompt template
    "不要加入功能列表、勾选项、参数、评分等信息。", // i18n-ignore image-generation prompt template
    ...(right ? ["两张卡片中间可以放一个简洁的 VS，略带手写笔刷感，但不要太夸张。"] : []), // i18n-ignore image-generation prompt template
    "色彩控制在 2～3 个主色以内。", // i18n-ignore image-generation prompt template
    !left // i18n-ignore image-generation prompt template
      ? `关键词与几何装饰使用${COLOR_PHRASE[accent]}，其他文字使用深灰。` // i18n-ignore image-generation prompt template
      : right // i18n-ignore image-generation prompt template
        ? `${left.name} 使用${colorOf(left)}，${right.name} 使用${colorOf(right)}，其他文字使用深灰。` // i18n-ignore image-generation prompt template
        : `${left.name} 使用${colorOf(left)}，其他文字使用深灰。`, // i18n-ignore image-generation prompt template
    "不要高饱和霓虹色，不要五颜六色。", // i18n-ignore image-generation prompt template
    "可以在背景角落加入非常淡的几何圆弧、圆形色块或浅色渐变作为层次，但透明度很低，不能抢主体。", // i18n-ignore image-generation prompt template
    "整体参考：AI 产品发布页 + 科技媒体封面 + 极简 SaaS 官网视觉。", // i18n-ignore image-generation prompt template
    "要有“专业评测”的感觉，而不是广告海报。", // i18n-ignore image-generation prompt template
    "特别要求：", // i18n-ignore image-generation prompt template
    "- 不要拥挤", // i18n-ignore image-generation prompt template
    "- 不要大量小字", // i18n-ignore image-generation prompt template
    "- 不要底部功能列表", // i18n-ignore image-generation prompt template
    "- 不要复杂 UI", // i18n-ignore image-generation prompt template
    "- 不要卡通插画", // i18n-ignore image-generation prompt template
    "- 不要人物", // i18n-ignore image-generation prompt template
    "- 不要过度装饰", // i18n-ignore image-generation prompt template
    left ? "- 保证公众号裁切后核心文字和 Logo 不被挡住" : "- 保证公众号裁切后核心文字不被挡住", // i18n-ignore image-generation prompt template
    "当前标题：", // i18n-ignore image-generation prompt template
    `「${title}」`, // i18n-ignore image-generation prompt template
    // With no highlight words, leave the choice to the model instead of an empty 「」 line // i18n-ignore image-generation prompt template
    ...(highlights.length > 0 // i18n-ignore image-generation prompt template
      ? ["重点突出：", ...highlights.map((one) => `「${one}」`)] // i18n-ignore image-generation prompt template
      : ["重点突出：从标题里挑 1～2 个最关键的词"]), // i18n-ignore image-generation prompt template
    ...(left ? ["右侧展示：", right ? `${left.name} vs ${right.name}` : left.name] : []), // i18n-ignore image-generation prompt template
    "最终效果要像一张高级、简洁、有明确视觉重点的公众号科技评测封面。", // i18n-ignore image-generation prompt template
    "字体不要太大，画面至少保留 30% 留白，标题最多 3 行，视觉重点只允许 1～2 个。", // i18n-ignore image-generation prompt template
  ].join("\n");
}

/**
 * Pick a ratio the model accepts from the 422 detail: only "W:H" forms count (auto or pixel sizes like 1536x1024 don't),
 * taking the widest landscape ratio; the cover is a banner, and a square or portrait image is worse than not switching.
 * If none can be picked (or only the one already tried remains), return null and the caller reports the error as-is.
 */
function widestAspect(detail: string, tried: Set<string>): string | null {
  let best: string | null = null;
  let widest = 1; // Start at 1:1: anything narrower is rejected
  for (const [, w, h] of detail.matchAll(/(\d{1,4})\s*:\s*(\d{1,4})/g)) {
    const ratio = Number(w) / Number(h);
    const value = `${Number(w)}:${Number(h)}`;
    if (!Number.isFinite(ratio) || ratio <= widest || tried.has(value)) continue;
    best = value;
    widest = ratio;
  }
  return best;
}

// HTTP status → unified error code and Chinese message
function httpError(status: number, body: { detail?: unknown } | null): CoverError {
  if (status === 401 || status === 403)
    return new CoverError("bad_token", tk("Replicate 拒绝了站点的 Token，请检查服务端配置"));
  if (status === 402) return new CoverError("billing", tk("站点的 Replicate 账户余额不足"));
  if (status === 422)
    return new CoverError("bad_input", `Replicate 说提示词或参数不对：${clip(body?.detail, 200)}`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
  if (status === 429) return new CoverError("rate_limited", tk("生图服务正忙，稍后再试"));
  return new CoverError("failed", `Replicate 返回 HTTP ${status}`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
}

/** Replicate prediction, only the fields we use */
interface Prediction {
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string; cancel?: string };
  /** On error this version returns { detail }, not a prediction */
  detail?: unknown;
}

/** One side of the comparison: name + the accent color it uses in the image */
export interface CoverProduct {
  name: string;
  color: CoverColor;
}

/** The sanitized version, ready to drop into the template */
export interface CoverFields {
  title: string;
  highlights: string[];
  /** Accent color: product A's swatch (taken even if the name is empty); with zero products it's used for highlights and geometric decoration */
  accent: CoverColor;
  left?: CoverProduct;
  right?: CoverProduct;
}

/** Raw request fields, not yet sanitized, hence all unknown */
export interface CoverRequest {
  title?: unknown;
  highlights?: unknown;
  left?: unknown;
  right?: unknown;
}

export interface CoverDeps {
  /** For unit-test injection; defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** Passed down when the client disconnects, so the upstream generation gets canceled too */
  signal?: AbortSignal | null;
  pollMs?: number;
}

/**
 * { title, highlights, left, right } → one image dataURL (wrapped in an array so the API shape is unchanged).
 * One click generates one image: if unhappy, click again, which beats generating two at once (slower and pricier). All failures throw CoverError.
 */
export async function generateCovers(
  req: CoverRequest,
  { fetchImpl = fetch, signal = null, pollMs = POLL_MS }: CoverDeps = {}
): Promise<string[]> {
  const token = process.env.REPLICATE_API_TOKEN?.trim() ?? "";
  if (!token) throw new CoverError("no_token", tk("服务端还没有配置 AI 生成封面"));
  // The route already sanitized these, but do it again: sanitizing is idempotent, and this path shouldn't trust any caller
  const fields = coverFields(req);
  const model = process.env.REPLICATE_MODEL?.trim() || DEFAULT_MODEL;
  const configured = Number(process.env.COVER_GENERATE_TIMEOUT_SEC);
  const timeoutSec = configured > 0 ? configured : DEFAULT_TIMEOUT_SEC;
  const deadline = Date.now() + timeoutSec * 1000;
  /** Raw detail of the latest 422: only used by input adaptation below to identify fields; the user-facing message was already truncated */
  let lastDetail = "";

  try {
    return await run();
  } catch (e) {
    // Safety net: the token must never appear in error text
    if (e instanceof Error && e.message.includes(token)) {
      e.message = e.message.split(token).join("***");
    }
    throw e;
  }

  /**
   * Fix as we go: whichever input the upstream 422 names, change that and retry until it's accepted.
   * The accepted version is remembered under the model name, and later requests for that model send it directly.
   */
  async function run(): Promise<string[]> {
    const tuned = MODEL_INPUT.get(model);
    const drop = new Set<string>(tuned?.drop ?? []);
    // Cache > env var > default: the env value may be exactly what the model rejected; only a previously accepted one is reliable
    let aspect = tuned?.aspectRatio || process.env.REPLICATE_ASPECT_RATIO?.trim() || DEFAULT_ASPECT;
    /** Ratio switched to by adaptation; only written to the cache if it actually changed */
    let picked = tuned?.aspectRatio;
    let adapted = false;
    // Don't retry a ratio already tried: detail often echoes back the one just rejected
    const tried = new Set<string>();

    for (let retry = 0; ; retry++) {
      tried.add(aspect);
      let started: Prediction;
      try {
        started = await create(aspect, drop);
      } catch (e) {
        // Only a 422 on prediction-creation inputs justifies tweaking and retrying; other errors are thrown as-is
        const detail = e instanceof CoverError && e.code === "bad_input" ? lastDetail : "";
        if (!detail || retry >= MAX_INPUT_RETRY) throw e;
        const next = detail.includes("aspect_ratio") ? widestAspect(detail, tried) : null;
        const extra = OPTIONAL_INPUT.filter((k) => !drop.has(k) && detail.includes(k));
        // If we can't tell which field it dislikes (or can't find a better ratio), don't guess; report the error as-is
        if (!next && extra.length === 0) throw e;
        alive(); // Before retrying, check there's time left and the user is still here
        if (next) picked = aspect = next;
        for (const key of extra) drop.add(key);
        adapted = true;
        continue;
      }
      // Upstream accepted these inputs: only worth remembering if changed; unchanged defaults will work next time too
      if (adapted) MODEL_INPUT.set(model, { aspectRatio: picked, drop });
      return [await finish(started)];
    }
  }

  /** Start a generation: models written as owner/name:hash use the versioned endpoint, otherwise the "latest model version" endpoint */
  async function create(aspect: string, drop: Set<string>): Promise<Prediction> {
    const input: Record<string, unknown> = {
      prompt: buildPrompt(fields, aspect),
      aspect_ratio: aspect,
      // Only one image at a time; if the model rejects this field, the input adaptation above drops it
      num_outputs: 1,
      output_format: "jpg",
      output_quality: 90,
    };
    for (const key of drop) delete input[key];
    const at = model.indexOf(":");
    const url = at > 0 ? `${API_BASE}v1/predictions` : `${API_BASE}v1/models/${model}/predictions`;
    const body = at > 0 ? { version: model.slice(at + 1), input } : { input };
    lastDetail = "";
    // Prefer: wait lets fast models (flux-schnell takes seconds) return the result in this request, skipping polling
    return callApi(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "wait=60" },
      body: JSON.stringify(body),
    });
  }

  /** Wait for a prediction to finish, then download the image as a dataURL; if the model returns several, take only the first */
  async function finish(started: Prediction): Promise<string> {
    let pred = started;
    while (RUNNING.includes(String(pred.status))) {
      if (Date.now() >= deadline) {
        // On timeout, try to cancel to save quota; cancel failures don't matter, it'll finish on its own
        try {
          await callApi(pred.urls?.cancel, { method: "POST" });
        } catch {}
        throw new CoverError("timeout", `生成超时了（超过 ${timeoutSec} 秒），稍后再试`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
      }
      await sleep(pollMs);
      pred = await callApi(pred.urls?.get);
    }
    if (pred.status !== "succeeded") {
      if (pred.status === "canceled") throw new CoverError("failed", tk("生成被取消了"));
      const why = String(pred.error ?? "");
      if (/nsfw|safety|sensitive/i.test(why))
        throw new CoverError("failed", tk("提示词被内容安全策略拦下了，换个说法试试"));
      throw new CoverError("failed", `生成失败：${clip(why, 200) || "未知原因"}`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
    }
    const outputs = (Array.isArray(pred.output) ? pred.output : [pred.output]).filter(
      (u): u is string => typeof u === "string" && u !== ""
    );
    if (outputs.length === 0) throw new CoverError("failed", tk("生成完了却没拿到图片"));
    return download(outputs[0]);
  }

  /** Gate before retrying: if time is up or the user has closed the panel, stop sending requests upstream */
  function alive(): void {
    if (Date.now() >= deadline)
      throw new CoverError("timeout", `生成超时了（超过 ${timeoutSec} 秒），稍后再试`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
    if (signal?.aborted) throw new CoverError("aborted", tk("已取消"));
  }

  // Token-bearing requests go only to Replicate: poll/cancel URLs come from upstream, so verify the domain before sending the token
  async function callApi(url: string | undefined, init: RequestInit = {}): Promise<Prediction> {
    if (typeof url !== "string" || !url.startsWith(API_BASE)) {
      throw new CoverError("failed", tk("Replicate 返回了异常的接口地址，已中止"));
    }
    const res = await request(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
    let body: Prediction | null = null;
    try {
      body = (await res.json()) as Prediction;
    } catch {}
    // Keep the raw 422 detail for input adaptation to identify fields; it never goes into error text, so it can't leak
    if (!res.ok) {
      lastDetail = res.status === 422 ? String(body?.detail ?? "") : "";
      throw httpError(res.status, body);
    }
    return body ?? {};
  }

  // Images are on a CDN; never send Authorization here, the token has no reason to leave api.replicate.com
  async function download(url: string): Promise<string> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new CoverError("failed", tk("图片地址不合法"));
    }
    if (target.protocol !== "https:") throw new CoverError("failed", tk("图片地址不是 https，已中止"));
    const res = await request(target.href, {});
    if (!res.ok) throw new CoverError("failed", `图片下载失败（HTTP ${res.status}）`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
    const header = (name: string) => String(res.headers?.get(name) ?? "");
    const type = header("content-type").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) throw new CoverError("failed", tk("下载到的不是图片"));
    if (Number(header("content-length")) > MAX_IMAGE_BYTES)
      throw new CoverError("failed", tk("生成的图片太大（超过 8MB）"));
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new CoverError("failed", tk("生成的图片太大（超过 8MB）"));
    return `data:${type};base64,${buf.toString("base64")}`;
  }

  // Translate network-layer errors in one place; wrap each request in a remaining-time timeout so a hung upstream can't stall us
  async function request(url: string, init: RequestInit): Promise<Response> {
    const timer = AbortSignal.timeout(Math.max(1000, deadline - Date.now()));
    try {
      return await fetchImpl(url, {
        ...init,
        signal: signal ? AbortSignal.any([signal, timer]) : timer,
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError")
        throw new CoverError("timeout", `生成超时了（超过 ${timeoutSec} 秒），稍后再试`); // i18n-ignore server-side error message with variables; client t() can't match it, so it stays Chinese for now
      if (name === "AbortError") throw new CoverError("aborted", tk("已取消"));
      throw new CoverError("network", tk("连不上生图服务，请稍后再试"));
    }
  }
}
