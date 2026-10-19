import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route layer only maps the service layer's three outcomes to 200 / 404 / 409 (plus 400 when baseUpdatedAt fails to parse).
 * Auth, the ban guard and prisma are all stubbed; business logic is verified in documents.test.ts.
 */
vi.mock("@/lib/routeAuth", () => ({
  requireUserId: vi.fn(async () => "u1"),
  // The real implementation checks for NextResponse, which is a subclass of Response
  isResponse: (v: unknown) => v instanceof Response,
}));
vi.mock("@/lib/guards", () => ({ readOnlyGuard: vi.fn(async () => null) }));
vi.mock("@/lib/active", () => ({
  touchDailyActive: vi.fn(async () => {}),
  chinaDate: () => "2026-09-18",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));
// Use the real parseBaseUpdatedAt (the 400 check depends on it); stub the write operations
vi.mock("@/lib/documents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/documents")>()),
  updateDocument: vi.fn(),
  createDocumentRow: vi.fn(),
  deleteDocument: vi.fn(),
  listDocuments: vi.fn(async () => []),
}));

import { createDocumentRow, updateDocument } from "@/lib/documents";
import { PUT } from "@/app/api/documents/[id]/route";
import { POST } from "@/app/api/documents/route";

const update = updateDocument as unknown as Mock;
const createRow = createDocumentRow as unknown as Mock;

const BASE = new Date("2026-09-18T03:00:00.000Z");
const NEWER = new Date("2026-09-18T03:00:05.000Z");

function put(body: unknown) {
  const req = new Request("http://localhost/api/documents/d1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ id: "d1" }) });
}

beforeEach(() => {
  update.mockReset();
  createRow.mockReset();
});

describe("PUT /api/documents/[id]", () => {
  it("冲突 → 409，带回服务端当前版本", async () => {
    update.mockResolvedValue({
      conflict: true,
      doc: {
        id: "d1",
        title: "服务端标题",
        category: "随笔",
        content: "服务端正文",
        createdAt: BASE,
        updatedAt: NEWER,
      },
    });

    const res = await put({ content: "本地正文", baseUpdatedAt: BASE.toISOString() });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      conflict: true,
      doc: {
        id: "d1",
        title: "服务端标题",
        category: "随笔",
        content: "服务端正文",
        updatedAt: NEWER.toISOString(),
      },
    });
    // baseUpdatedAt is parsed into a Date as-is and passed to the service layer
    expect(update.mock.calls[0][2].baseUpdatedAt).toEqual(BASE);
  });

  it("写成 → 200 ok + 服务端时间戳", async () => {
    update.mockResolvedValue({ conflict: false, updatedAt: NEWER });

    const res = await put({ content: "x", baseUpdatedAt: BASE.toISOString() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updatedAt: NEWER.toISOString() });
  });

  it("文档不存在 → 404", async () => {
    update.mockResolvedValue(null);
    const res = await put({ content: "x", baseUpdatedAt: BASE.toISOString() });
    expect(res.status).toBe(404);
  });

  it("不带 baseUpdatedAt → 老行为：服务层收到 null，不做版本条件", async () => {
    update.mockResolvedValue({ conflict: false, updatedAt: NEWER });

    const res = await put({ content: "x" });

    expect(res.status).toBe(200);
    expect(update.mock.calls[0][2].baseUpdatedAt).toBeNull();
  });

  it("baseUpdatedAt 解析不出来 → 400，绝不悄悄退回无条件覆盖", async () => {
    const res = await put({ content: "x", baseUpdatedAt: "昨天" });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("POST /api/documents", () => {
  it("clientKey 透传给服务层，返回整行", async () => {
    createRow.mockResolvedValue({ id: "d2", title: "新建", clientKey: "k1" });

    const res = await POST(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "新建", clientKey: "k1" }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "d2", clientKey: "k1" });
    expect(createRow.mock.calls[0][1]).toMatchObject({ title: "新建", clientKey: "k1" });
  });

  it("不带 clientKey：照旧创建", async () => {
    createRow.mockResolvedValue({ id: "d3", title: "未命名文章" });

    const res = await POST(
      new Request("http://localhost/api/documents", { method: "POST", body: "{}" })
    );

    expect(res.status).toBe(200);
    expect(createRow.mock.calls[0][1].clientKey).toBeUndefined();
  });
});
