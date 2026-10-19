/**
 * AI cover generation: ask the site's /api/cover/generate to draw one with an image model; if unsatisfied, click again.
 * The prompt is a fixed Chinese template on the server; the web side just collects the blanks, sends them, and turns the result into a File;
 * the Replicate token stays server-side, out of the browser's reach.
 * Pure functions with no React and no toasts — errors are always thrown, and the UI decides how to show them.
 */

import { t, tk } from "@/i18n/t";
import { IMAGE_EXT } from "@/lib/media";

/** Cover generation endpoint. Same-origin, so the browser sends the session cookie by default */
const GENERATE_API = "/api/cover/generate";

/** Message for when the server is unreachable: distinct from "site not configured", and the UI offers a different next step */
const OFFLINE = tk("现在连不上服务器，稍后再试");

/** Mirrors the allowlist in the server's lib/coverGenerate/replicate one-to-one; change both together */
export type CoverColor = "blue" | "orange" | "green" | "purple" | "red" | "teal" | "gray";

/** One side of the comparison: a name + its theme color in the image */
export interface CoverProduct {
  name: string;
  color: CoverColor;
}

/** A failure carrying the server's error code, which the UI branches on (e.g. 403 should say the account isn't enabled); offline when unreachable */
export class CoverGenerateError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Color options: id is the value agreed with the service, label is for the UI (stored as the Chinese source, t() at display), css is just how the dot looks —
 * what actually goes into the prompt is the server's Chinese wording (like 「暖橙 / 陶土色」); these color values aren't sent.
 */
export const COVER_COLORS: { id: CoverColor; label: string; css: string }[] = [
  { id: "blue", label: tk("蓝色"), css: "#2f6fed" },
  { id: "orange", label: tk("暖橙"), css: "#d9783f" },
  { id: "green", label: tk("绿色"), css: "#2f9e5e" },
  { id: "purple", label: tk("紫色"), css: "#7c53e0" },
  { id: "red", label: tk("红色"), css: "#d94b4b" },
  { id: "teal", label: tk("青色"), css: "#1d9a94" },
  { id: "gray", label: tk("深灰"), css: "#5a6270" },
];

/** Color ids read back from localStorage and the like must be validated first; unknown ones fall back to the caller's default */
export function isCoverColor(value: unknown): value is CoverColor {
  return COVER_COLORS.some((c) => c.id === value);
}

/**
 * Whether cover generation is available:
 *   offline      server unreachable (offline shell, no network, reverse proxy down)
 *   unconfigured the site has no image generation token configured
 *   forbidden    configured, but this account doesn't have 「AI 生成封面」 (AI cover generation) enabled (it costs the site money)
 *   ready        can generate
 */
export type CoverServiceState = "offline" | "unconfigured" | "forbidden" | "ready";

/** allowed comes from the caller via useCan("ai_cover"); the server checks separately, this only decides what the UI shows */
export async function coverServiceState(
  allowed: boolean,
  signal?: AbortSignal
): Promise<CoverServiceState> {
  try {
    const res = await fetch("/api/config", { signal });
    if (!res.ok) return "offline";
    const data = (await res.json()) as { coverGenerate?: unknown };
    // If the site hasn't enabled the feature at all, say so first: asking for permission only to then say "not configured" wastes a trip
    if (data?.coverGenerate !== true) return "unconfigured";
  } catch {
    // Unreachable, or a non-JSON response (blocked by a gateway), both count as "can't reach the server"
    return "offline";
  }
  return allowed ? "ready" : "forbidden";
}

/**
 * Generate a cover, returning an array of dataURLs (the server generates one at a time, so it holds a single element).
 * Generation takes tens of seconds; callers must pass a signal and abort when the panel closes.
 * Throws an Error on failure, whose message is a user-facing sentence.
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
        // Omit empty fields entirely: on the server a missing one means "let the model pick from the title"
        ...(req.highlights?.length ? { highlights: req.highlights } : {}),
        left: req.left,
        ...(req.right ? { right: req.right } : {}),
      }),
      signal,
    });
  } catch (e) {
    // Rethrow aborts unchanged, otherwise the UI can't tell "user closed the panel" from "server unreachable"
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new CoverGenerateError(t(OFFLINE), "offline");
  }
  const data = (await res.json().catch(() => null)) as
    | { images?: unknown; error?: unknown; message?: unknown }
    | null;
  if (!res.ok) {
    // Rate limit and permission messages are already human-readable from the server, so show them as-is
    const message = typeof data?.message === "string" ? data.message : "";
    const code = typeof data?.error === "string" ? data.error : "failed";
    throw new CoverGenerateError(message || t("生成失败（{status}）", { status: res.status }), code);
  }
  const images = Array.isArray(data?.images)
    ? data.images.filter((i): i is string => typeof i === "string" && i.startsWith("data:"))
    : [];
  if (images.length === 0) throw new CoverGenerateError(t("服务没有返回图片，请再试一次"), "failed");
  return images;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** dataURL → File: generation returns a dataURL, while the save path (library / cloud) needs a File */
export function dataUrlToFile(dataUrl: string, name?: string): File {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!m) throw new Error(t("生成结果不是图片数据"));
  const mime = m[1];
  const bytes = m[2] ? base64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
  const ext = IMAGE_EXT[mime] ?? "png";
  return new File([bytes as BlobPart], name ?? `cover-${Date.now()}.${ext}`, { type: mime });
}
