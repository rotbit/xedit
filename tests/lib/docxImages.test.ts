// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { Document, Packer } from "docx";
import JSZip from "jszip";
import { childBlocks } from "@/lib/docx/block";
import type { Build } from "@/lib/docx/types";

/** 1x1 PNG 的最小字节，足够让 docx 库当作图片打包 */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]).buffer;

async function render(html: string, images: Record<string, string>) {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const b: Build = { images: new Map(), math: new Map(), frames: new Map(), olInstance: 0, failed: 0 };
  for (const [src, alt] of Object.entries(images)) {
    void alt;
    b.images.set(src, { data: PNG, type: "png", width: 1, height: 1 });
  }
  const doc = new Document({ sections: [{ children: childBlocks(body, { quote: 0 }, b) }] });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return {
    xml: await zip.file("word/document.xml")!.async("string"),
    media: Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/")),
  };
}

describe("导出 Word 的图片", () => {
  test("独立图片与行内图片都嵌入，且 docPr 带非空 name/descr", async () => {
    const html =
      '<figure><img src="a.png" alt="封面"></figure>' +
      '<p><img src="b.png" alt="">说明文字</p>' +
      '<p>前文 <img src="c.png" alt="行内"> 后文</p>';
    const { xml, media } = await render(html, { "a.png": "封面", "b.png": "", "c.png": "行内" });
    // 三张图字节相同，docx 库按内容去重只存一份媒体文件；正文里仍是三处绘图
    expect(media.length).toBeGreaterThanOrEqual(1);
    expect((xml.match(/<w:drawing>/g) ?? []).length).toBe(3);
    expect(xml).not.toMatch(/<wp:docPr [^>]*name=""/);
    expect(xml).toMatch(/<wp:docPr [^>]*descr="封面"/);
    expect(xml).not.toContain("[图片");
  });

  test("取不到字节的图片退化为占位文字而不是空白", async () => {
    const { xml, media } = await render('<figure><img src="x.png" alt="丢失的图"></figure>', {});
    expect(media).toHaveLength(0);
    expect(xml).toContain("[图片：丢失的图]");
  });
});
