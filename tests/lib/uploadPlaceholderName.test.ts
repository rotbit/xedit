// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { shortenFileName } from "@/lib/editor/uploadPlaceholder";

describe("上传占位牌子的文件名", () => {
  test("短名原样保留", () => {
    expect(shortenFileName("image.png")).toBe("image.png");
  });
  test("长名中间省略并保留扩展名", () => {
    const out = shortenFileName("Screenshot 2026-10-18 at 14.22.31.png");
    expect(out.length).toBeLessThanOrEqual(25);
    expect(out).toMatch(/^Screenshot .*….*\.png$/);
  });
  test("没有扩展名也能缩", () => {
    expect(shortenFileName("a".repeat(40), 10)).toMatch(/^a+…a+$/);
  });
});
