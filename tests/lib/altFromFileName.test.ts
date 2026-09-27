import { describe, expect, it } from "vitest";
import { altFromFileName } from "@/lib/media";

describe("altFromFileName：占位文件名不当图注", () => {
  it("剪贴板截图的默认名一律留空", () => {
    for (const name of ["image.png", "Image.jpeg", "image (2).png", "img_3.webp", "blob", "screenshot-1.png", "截图.png", "图片 2.png", "未命名.png"]) {
      expect(altFromFileName(name), name).toBe("");
    }
  });

  it("作者起的文件名保留（去掉扩展名）", () => {
    expect(altFromFileName("架构图.png")).toBe("架构图");
    expect(altFromFileName("image-of-cat.png")).toBe("image-of-cat");
    expect(altFromFileName("demo.final.mp4")).toBe("demo.final");
  });
});
