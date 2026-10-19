/**
 * Uploading local docs created while signed out: POST carries clientKey (the server uses it for idempotency, so resends after a dropped connection don't create duplicates),
 * and if the user edits the doc during the upload round trip, the latest content must survive. Runs the real full syncNow round.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/components/Toast", () => ({ toast: toastSpy }));

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

async function load() {
  vi.resetModules();
  const [sync, docStore, localDocs] = await Promise.all([
    import("@/lib/sync"),
    import("@/lib/docStore"),
    import("@/lib/localDocs"),
  ]);
  return { ...sync, ...docStore, ...localDocs };
}

const SERVER_AT = "2026-06-01T00:00:00.000Z";

describe("本地文档上云", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    toastSpy.mockClear();
  });

  it("POST 带 clientKey；上云后删掉本地副本，内容进镜像", async () => {
    const mods = await load();
    const local = mods.createLocalDoc({ title: "草稿", content: "离线写的", category: "随笔" });

    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        return jsonRes({
          id: "srv-1",
          title: "草稿",
          category: "随笔",
          updatedAt: SERVER_AT,
          content: "离线写的",
        });
      }
      void url;
      return jsonRes([
        { id: "srv-1", title: "草稿", category: "随笔", updatedAt: SERVER_AT, content: "离线写的" },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await mods.syncNow();

    const posted = JSON.parse(
      fetchMock.mock.calls.find((c) => c[1]?.method === "POST")![1]!.body!
    ) as { clientKey: string; title: string; content: string };
    expect(posted.clientKey).toBe(local.id); // Local ids are inherently unique and stable, so they serve as idempotency keys
    expect(posted.content).toBe("离线写的");

    expect(mods.listLocalDocs()).toHaveLength(0);
    expect(mods.getMirrorContent("srv-1")).toBe("离线写的");
    expect(mods.getMirrorMeta("srv-1")!.dirty).toBeFalsy();
  });

  it("上传期间又改了这篇：最新内容留成 dirty 镜像，不会被删掉", async () => {
    const mods = await load();
    const local = mods.createLocalDoc({ title: "草稿", content: "第一版", category: "随笔" });

    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        // The user keeps writing while the request is in flight
        mods.updateLocalDoc(local.id, { content: "第一版 + 又写了两段" });
        return jsonRes({
          id: "srv-1",
          title: "草稿",
          category: "随笔",
          updatedAt: SERVER_AT,
          content: "第一版",
        });
      }
      void url;
      return jsonRes([
        { id: "srv-1", title: "草稿", category: "随笔", updatedAt: SERVER_AT, content: "第一版" },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await mods.syncNow();

    expect(mods.listLocalDocs()).toHaveLength(0);
    const meta = mods.getMirrorMeta("srv-1")!;
    expect(meta.dirty).toBe(true); // Wait for the push queue to send the new content up
    expect(mods.getMirrorContent("srv-1")).toBe("第一版 + 又写了两段");
  });
});
