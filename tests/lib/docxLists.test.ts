// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Document, Packer } from "docx";
import JSZip from "jszip";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { childBlocks } from "@/lib/docx/block";
import { stripSpaceAfterBreaks } from "@/lib/docx/media";
import type { Build } from "@/lib/docx/types";

/** 跑真实的 Markdown → HTML → docx 管线并解包，把正文每个 <w:p> 压成「是否带编号 + 文本」便于断言 */
async function paragraphs(md: string): Promise<{ marked: boolean; text: string }[]> {
  const body = new DOMParser().parseFromString(sanitizeHtml(renderMarkdown(md, {})), "text/html").body;
  stripSpaceAfterBreaks(body);
  const b: Build = { images: new Map(), math: new Map(), frames: new Map(), olInstance: 0, failed: 0 };
  const doc = new Document({ sections: [{ children: childBlocks(body, { quote: 0 }, b) }] });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file("word/document.xml")!.async("string");
  return Array.from(xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)).map(([, p]) => ({
    marked: /<w:numPr>/.test(p),
    text: Array.from(p.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)).map((m) => m[1]).join(""),
  }));
}

describe("docx 列表导出", () => {
  it("宽松有序列表（每项包 <p>）：编号与正文在同一段，没有多余空段", async () => {
    expect(await paragraphs("1. 第一\n\n2. 第二\n\n3. 第三\n")).toEqual([
      { marked: true, text: "第一" },
      { marked: true, text: "第二" },
      { marked: true, text: "第三" },
    ]);
  });

  it("嵌套列表：父项文本不带尾随空格，嵌套列表后不多出空段", async () => {
    expect(await paragraphs("- 项目一\n- 项目二\n  - 嵌套 1\n- 项目三\n")).toEqual([
      { marked: true, text: "项目一" },
      { marked: true, text: "项目二" },
      { marked: true, text: "嵌套 1" },
      { marked: true, text: "项目三" },
    ]);
  });

  it("一项多段：首段带编号，后续段落只缩进", async () => {
    expect(await paragraphs("1. 第一\n\n   补充说明\n\n2. 第二\n")).toEqual([
      { marked: true, text: "第一" },
      { marked: false, text: "补充说明" },
      { marked: true, text: "第二" },
    ]);
  });
});
