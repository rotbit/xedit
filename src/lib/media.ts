/**
 * 图床媒体类型白名单与工具（客户端安全，不依赖 ali-oss）。
 * 图片：直传 + /api/upload 中转兜底；视频：仅浏览器直传（中转会把整个文件读进内存）。
 */

/** 允许上传的图片类型 → 扩展名 */
export const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** 允许上传的视频类型 → 扩展名（浏览器能播、公众号常见的三种） */
export const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MEDIA_EXT: Record<string, string> = { ...IMAGE_EXT, ...VIDEO_EXT };

/** 单张图片大小上限 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** 单个视频大小上限 */
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

export function isVideoMime(mime: string): boolean {
  return mime in VIDEO_EXT;
}

export function maxSizeOf(mime: string): number {
  return isVideoMime(mime) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
}

/** 超限提示：图片/视频各自的人话文案 */
export function sizeLimitError(mime: string): string {
  return isVideoMime(mime) ? "视频不能超过 100MB" : "图片不能超过 10MB";
}

/** 由扩展名反推 mime（OSS 历史同步、直传登记时只有对象 key 可用） */
export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** URL 是否指向视频（按扩展名判断，容忍查询串与锚点） */
const VIDEO_URL_RE = /\.(mp4|webm|mov|m4v)(?:$|[?#])/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_URL_RE.test(url);
}

/**
 * 视频封面帧的携带约定：写在图片语法的 title 位。
 *   ![说明](https://…/video.mp4 "poster=https://…/cover.jpg")
 * 渲染时 title 以 poster= 开头则作为 <video poster>，不再当普通 title。
 */
export function posterFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const m = title.match(/^poster=(https?:\/\/\S+)$/);
  return m ? m[1] : null;
}
