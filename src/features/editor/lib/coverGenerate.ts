/**
 * AI 生封面：请求本站的 /api/cover/generate 用生图模型画一张，不满意就再点一次。
 * 提示词是服务端写死的一份中文模板，网页这边只管把几个填空收齐发过去、把结果变成 File；
 * Replicate Token 在服务端，浏览器碰不到。
 * 纯函数，不认识 React，也不弹提示——错误一律抛出，由界面决定怎么显示。
 */

import { IMAGE_EXT } from "@/lib/media";

/** 生封面接口。同源，浏览器默认就把登录 cookie 带上 */
const GENERATE_API = "/api/cover/generate";

/** 连不上服务器时的说法：和「站点没配置」是两回事，界面上给的下一步动作也不同 */
const OFFLINE = "现在连不上服务器，稍后再试";

/** 与服务端 lib/coverGenerate/replicate 那份白名单一一对应，改了要两边一起改 */
export type CoverColor = "blue" | "orange" | "green" | "purple" | "red" | "teal" | "gray";

/** 要对比的一方：名字 + 它在图里用的主题色 */
export interface CoverProduct {
  name: string;
  color: CoverColor;
}

/** 带服务端错误码的失败，界面据此分流（如 403 要改口说「账号没开通」）；连不上时是 offline */
export class CoverGenerateError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 配色选项：id 是与服务约定的值，label 给界面用，css 只是色点画出来的样子——
 * 真正进提示词的是服务端那份中文说法（「暖橙 / 陶土色」之类），这里的色值不下发。
 */
export const COVER_COLORS: { id: CoverColor; label: string; css: string }[] = [
  { id: "blue", label: "蓝色", css: "#2f6fed" },
  { id: "orange", label: "暖橙", css: "#d9783f" },
  { id: "green", label: "绿色", css: "#2f9e5e" },
  { id: "purple", label: "紫色", css: "#7c53e0" },
  { id: "red", label: "红色", css: "#d94b4b" },
  { id: "teal", label: "青色", css: "#1d9a94" },
  { id: "gray", label: "深灰", css: "#5a6270" },
];

/** 从 localStorage 之类读回来的色号得先验一遍，不认识的按调用方的默认值走 */
export function isCoverColor(value: unknown): value is CoverColor {
  return COVER_COLORS.some((c) => c.id === value);
}

/**
 * 生封面能不能用：
 *   offline      连不上服务器（离线壳、断网、反代挂了）
 *   unconfigured 站点没配生图 Token
 *   forbidden    配了，但当前账号没开通「AI 生成封面」（生图花的是站点的钱）
 *   ready        可以生成
 */
export type CoverServiceState = "offline" | "unconfigured" | "forbidden" | "ready";

/** allowed 由调用方从 useCan("ai_cover") 取；服务端另有一道判定，这里只决定界面显示什么 */
export async function coverServiceState(
  allowed: boolean,
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
  return allowed ? "ready" : "forbidden";
}

/**
 * 生成封面，返回 dataURL 数组（服务端一次只生一张，所以里面就一个元素）。
 * 生图要几十秒，调用方务必传 signal，面板一关就 abort。
 * 失败抛出 Error，message 直接是能给用户看的一句话。
 */
export async function generateCovers(
  req: {
    title: string;
    highlights?: string[];
    left: CoverProduct;
    right?: CoverProduct | null;
  },
  signal?: AbortSignal
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(GENERATE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: req.title,
        // 没填的字段干脆不发：服务端那边缺了就是「让模型自己从标题里挑」
        ...(req.highlights?.length ? { highlights: req.highlights } : {}),
        left: req.left,
        ...(req.right ? { right: req.right } : {}),
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
