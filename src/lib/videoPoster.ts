"use client";

/**
 * 抽取视频首帧作封面：靠浏览器解码，画到 canvas 再导出 JPEG。
 * 解不出来（如 Chrome 播不了的 mov、损坏文件）返回 null，调用方按无封面继续。
 */

const POSTER_MAX_WIDTH = 1280;
const POSTER_QUALITY = 0.85;
const DECODE_TIMEOUT = 8000;

export async function extractVideoPoster(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    const ready = new Promise<void>((resolve, reject) => {
      video.addEventListener("error", () => reject(new Error("decode failed")), { once: true });
      video.addEventListener(
        "loadeddata",
        () => {
          // 有些编码 0 时刻是黑帧，往后挪 0.1s 再截
          const seekTo = Math.min(0.1, (video.duration || 0) / 2);
          if (video.currentTime >= seekTo) return resolve();
          video.addEventListener("seeked", () => resolve(), { once: true });
          video.currentTime = seekTo;
        },
        { once: true }
      );
    });
    await Promise.race([
      ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("decode timeout")), DECODE_TIMEOUT)
      ),
    ]);

    if (!video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, POSTER_MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", POSTER_QUALITY)
    );
    if (!blob) return null;
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([blob], `${base}-poster.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    video.src = "";
    URL.revokeObjectURL(url);
  }
}
