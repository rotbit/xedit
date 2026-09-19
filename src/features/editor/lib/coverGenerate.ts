/**
 * AI 生封面：请求本机草稿服务（与「发送到公众号」同一个服务）用生图模型画两张候选。
 * 网页这边只管拼提示词、发请求、把结果变成 File；模型 Key 在服务那边，浏览器碰不到。
 * 纯函数，不认识 React，也不弹提示——错误一律抛出，由界面决定怎么显示。
 */

import { IMAGE_EXT } from "@/lib/media";

/** 本机草稿服务（只监听 127.0.0.1），发草稿与生封面共用 */
export const DRAFT_SERVICE = "http://127.0.0.1:17831";

/** 连不上服务时的说法：和「没配 Key」是两回事，界面上给的下一步动作也不同 */
const OFFLINE = "没连上本机草稿服务，请确认 xEdit 桌面端正在运行";

export type CoverStyle = "minimal" | "illustration" | "photo" | "tech";

/** 风格选项：id 是与服务约定的值，label 给界面用 */
export const COVER_STYLES: { id: CoverStyle; label: string }[] = [
  { id: "minimal", label: "极简" },
  { id: "illustration", label: "插画" },
  { id: "photo", label: "摄影" },
  { id: "tech", label: "科技感" },
];

/**
 * 生封面能不能用：
 *   offline      服务没跑（桌面端没开）
 *   unconfigured 服务跑着但没配生图 Key
 *   ready        可以生成
 */
export type CoverServiceState = "offline" | "unconfigured" | "ready";

export async function coverServiceState(signal?: AbortSignal): Promise<CoverServiceState> {
  try {
    const res = await fetch(`${DRAFT_SERVICE}/status`, { signal });
    if (!res.ok) return "offline";
    const data = (await res.json()) as { coverGenerate?: unknown };
    return data?.coverGenerate === true ? "ready" : "unconfigured";
  } catch {
    // 连不上、答的不是 JSON（端口被别的程序占了）都按「没服务」处理
    return "offline";
  }
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
    res = await fetch(`${DRAFT_SERVICE}/cover/generate`, {
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
    // abort 要原样往上抛，否则界面分不清「用户关了面板」和「服务没开」
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(OFFLINE);
  }
  const data = (await res.json().catch(() => null)) as
    | { images?: unknown; message?: unknown }
    | null;
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : "";
    throw new Error(message || `生成失败（${res.status}）`);
  }
  const images = Array.isArray(data?.images)
    ? data.images.filter((i): i is string => typeof i === "string" && i.startsWith("data:"))
    : [];
  if (images.length === 0) throw new Error("服务没有返回图片，请再试一次");
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
