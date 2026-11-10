import sharp from "sharp";
import { IMAGE_EXT, MAX_IMAGE_SIZE } from "@/lib/media";
import { tk } from "@/i18n/t";

/** Re-encode uploaded images before public storage. Sharp removes EXIF/GPS/XMP unless metadata is explicitly retained. */
export async function prepareImage(buffer: Buffer, mime: string): Promise<{ buffer: Buffer; mime: string }> {
  if (!Object.hasOwn(IMAGE_EXT, mime)) return { buffer, mime };
  const image = sharp(buffer, { animated: true, limitInputPixels: 40_000_000 }).timeout({ seconds: 15 });
  const metadata = await image.metadata();
  const format = metadata.format;
  if (!format || !["jpeg", "png", "gif", "webp", "svg"].includes(format)) {
    throw new Error(tk("不支持的图片内容"));
  }
  // Preserve GIF/WebP animation. Rotate single images according to EXIF before removing their orientation tag.
  if ((metadata.pages ?? 1) === 1) image.autoOrient();
  // SVG becomes a static PNG: public uploads must not contain executable SVG or external resource references.
  const result = await (format === "svg" ? image.png() : image).toBuffer();
  if (result.length > MAX_IMAGE_SIZE) throw new Error(tk("图片不能超过 10MB"));
  const outputMime = format === "svg" ? "image/png" : `image/${format}`;
  return { buffer: result, mime: outputMime };
}
