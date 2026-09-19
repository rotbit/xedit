/**
 * AI 生封面：请求本站的 /api/cover/generate 用生图模型画两张候选。
 * 网页这边只管拼提示词、发请求、把结果变成 File；Replicate Token 在服务端，浏览器碰不到。
 * 纯函数，不认识 React，也不弹提示——错误一律抛出，由界面决定怎么显示。
 */

import { IMAGE_EXT } from "@/lib/media";

/** 生封面接口。同源，浏览器默认就把登录 cookie 带上 */
const GENERATE_API = "/api/cover/generate";

/** 连不上服务器时的说法：和「站点没配置」是两回事，界面上给的下一步动作也不同 */
const OFFLINE = "现在连不上服务器，稍后再试";

export type CoverStyle = "minimal" | "illustration" | "photo" | "tech";

/** 带服务端错误码的失败，界面据此分流（如 403 要改口说「只对管理员开放」）；连不上时是 offline */
export class CoverGenerateError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** 风格选项：id 是与服务约定的值，label 给界面用 */
export const COVER_STYLES: { id: CoverStyle; label: string }[] = [
  { id: "minimal", label: "极简" },
  { id: "illustration", label: "插画" },
  { id: "photo", label: "摄影" },
  { id: "tech", label: "科技感" },
];

/**
 * 生封面能不能用：
 *   offline      连不上服务器（离线壳、断网、反代挂了）
 *   unconfigured 站点没配生图 Token
 *   forbidden    配了，但当前账号不是管理员（生图花的是站点的钱）
 *   ready        可以生成
 */
export type CoverServiceState = "offline" | "unconfigured" | "forbidden" | "ready";

/** isAdmin 由调用方从会话里取（session.user.isAdmin）；服务端另有一道判定，这里只决定界面显示什么 */
export async function coverServiceState(
  isAdmin: boolean,
  signal?: AbortSignal
): Promise<CoverServiceState> {
  try {
    const res = await fetch("/api/config", { signal });
    if (!res.ok) return "offline";
    const data = (await res.json()) as { coverGenerate?: unknown };
    // 站点压根没开这个功能就先说没开：先提权限、进去了再说「没配置」是白折腾一趟
    if (data?.coverGenerate !== true) return "unconfigured";
  } catch {
    // 连不上、答的不是 JSON（被网关拦了）都按「够不着服务器」处理
    return "offline";
  }
  return isAdmin ? "ready" : "forbidden";
}

/** 一次要几张：两张够挑，再多既慢又贵 */
export const COVER_COUNT = 2;

/**
 * 生成候选封面，返回 dataURL 数组。
 * 生图要几十秒，调用方务必传 signal，面板一关就 abort。
 * 失败抛出 Error，message 直接是能给用户看的一句话。
 */
export async function generateCovers(
  req: { prompt: string; style?: CoverStyle | null; count?: number },
  signal?: AbortSignal
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(GENERATE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: req.prompt,
        ...(req.style ? { style: req.style } : {}),
        count: req.count ?? COVER_COUNT,
      }),
      signal,
    });
  } catch (e) {
    // abort 要原样往上抛，否则界面分不清「用户关了面板」和「连不上服务器」
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new CoverGenerateError(OFFLINE, "offline");
  }
  const data = (await res.json().catch(() => null)) as
    | { images?: unknown; error?: unknown; message?: unknown }
    | null;
  if (!res.ok) {
    // 限流、权限这些说法服务端已经写成人话了，原样显示
    const message = typeof data?.message === "string" ? data.message : "";
    const code = typeof data?.error === "string" ? data.error : "failed";
    throw new CoverGenerateError(message || `生成失败（${res.status}）`, code);
  }
  const images = Array.isArray(data?.images)
    ? data.images.filter((i): i is string => typeof i === "string" && i.startsWith("data:"))
    : [];
  if (images.length === 0) throw new CoverGenerateError("服务没有返回图片，请再试一次", "failed");
  return images;
}

/** 提示词里塞正文的前多少个字：够模型知道写的是什么，又不至于把它带偏 */
export const PROMPT_BODY_CHARS = 120;

/** markdown 语法 → 人话：提示词只要能读的字，符号留着只会干扰生图 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 图片整块丢掉，它的说明文字不是正文
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接只留文字
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>+|[-*+]|\d+\.)\s+/gm, "") // 标题/引用/列表的行首记号
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, " ") // 分隔线
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 预填的提示词：标题 + 正文开头，用户可以改 */
export function coverPrompt(title: string, body: string): string {
  const name = title.trim();
  const head = name ? `为这篇文章配一张封面：《${name}》。` : "为这篇文章配一张封面。";
  const gist = stripMarkdown(body).slice(0, PROMPT_BODY_CHARS);
  return gist ? `${head}内容：${gist}` : head;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** dataURL → File：生成结果是 dataURL，而存图那条路（文库 / 云端）要的是 File */
export function dataUrlToFile(dataUrl: string, name?: string): File {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!m) throw new Error("生成结果不是图片数据");
  const mime = m[1];
  const bytes = m[2] ? base64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
  const ext = IMAGE_EXT[mime] ?? "png";
  return new File([bytes as BlobPart], name ?? `cover-${Date.now()}.${ext}`, { type: mime });
}
