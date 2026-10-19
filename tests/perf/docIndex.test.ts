/**
 * Invalidation rule for the derived-data cache: only metadata (updatedAt + chars), no longer reading bodies to compare lengths.
 * Body reads are replaced with a counting in-memory stub; "how many reads" is the only thing measured here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { contents, reads } = vi.hoisted(() => ({
  contents: new Map<string, string>(),
  reads: { n: 0 },
}));

vi.mock("@/lib/docContent", () => ({
  getDocContent: (id: string) => {
    reads.n++;
    return contents.get(id) ?? "";
  },
}));

import { indexOf, pruneIndex } from "@/lib/docIndex";
import type { DocMeta } from "@/features/workspace/types";

const meta = (patch: Partial<DocMeta> = {}): DocMeta => ({
  id: "a",
  title: "一篇文章",
  updatedAt: "2026-09-18T00:00:00.000Z",
  chars: 12,
  ...patch,
});

beforeEach(() => {
  pruneIndex([]);
  contents.clear();
  contents.set("a", "正文里有 [[目标|显示]] 一处链接");
  reads.n = 0;
});

describe("docIndex 失效", () => {
  it("元信息没变：连查 100 次只读一次正文", () => {
    const doc = meta();
    let last = indexOf(doc);
    for (let i = 0; i < 99; i++) last = indexOf(meta()); // A new object every time, only the values are the same
    expect(reads.n).toBe(1);
    expect(last.text).toContain("显示");
    expect(last.links).toHaveLength(1);
  });

  it("updatedAt 变了：重读一次", () => {
    indexOf(meta());
    contents.set("a", "换了正文");
    indexOf(meta({ updatedAt: "2026-09-18T01:00:00.000Z" }));
    expect(reads.n).toBe(2);
    expect(indexOf(meta({ updatedAt: "2026-09-18T01:00:00.000Z" })).text).toBe("换了正文");
    expect(reads.n).toBe(2);
  });

  it("chars 变了：重读一次（同一秒内改动，updatedAt 可能没动）", () => {
    indexOf(meta());
    contents.set("a", "正文长度变了一点点");
    indexOf(meta({ chars: 13 }));
    expect(reads.n).toBe(2);
  });

  it("老条目没有 chars：退回只认 updatedAt", () => {
    indexOf(meta({ chars: undefined }));
    indexOf(meta({ chars: undefined }));
    expect(reads.n).toBe(1);
    indexOf(meta({ chars: undefined, updatedAt: "2026-09-19T00:00:00.000Z" }));
    expect(reads.n).toBe(2);
  });

  it("正文还没落到本地：空结果不长住，下次再读", () => {
    contents.set("a", "");
    expect(indexOf(meta()).text).toBe("");
    expect(indexOf(meta()).text).toBe("");
    expect(reads.n).toBe(2);
    // When the mirror arrives (updatedAt/chars unchanged) it's reflected immediately too
    contents.set("a", "镜像终于到了");
    expect(indexOf(meta()).text).toBe("镜像终于到了");
  });

  it("pruneIndex 清掉不在库里的文章", () => {
    indexOf(meta());
    pruneIndex(["b"]);
    indexOf(meta());
    expect(reads.n).toBe(2);
  });
});
