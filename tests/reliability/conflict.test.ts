/**
 * 409 冲突：云端那份先存成历史版本，再用新基线把本地内容推上去。
 * 底线是「本地改动不丢、云端那份找得回」。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted 保证整个文件共用同一个 fn：resetModules 后工厂会重跑，
// 在工厂里现造 vi.fn 的话被测模块与断言拿到的就不是同一个了
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
  const [sync, docStore] = await Promise.all([import("@/lib/sync"), import("@/lib/docStore")]);
  return { ...sync, ...docStore };
}

const BASE = "2026-05-01T00:00:00.000Z";
const SERVER = "2026-05-01T09:00:00.000Z";
const MERGED = "2026-05-01T10:00:00.000Z";

/** 先建一份「从服务端 BASE 版派生、本地又改过」的镜像 */
async function seedDirtyMirror(store: {
  applyServerDoc: (doc: {
    id: string;
    title: string;
    category: string;
    content: string;
    updatedAt: string;
  }) => void;
  saveMirrorLocal: (id: string, patch: { content?: string }) => void;
}) {
  store.applyServerDoc({
    id: "d1",
    title: "旅行笔记",
    category: "随笔",
    content: "原文",
    updatedAt: BASE,
  });
  store.saveMirrorLocal("d1", { content: "本地改过的正文" });
}

describe("409 冲突", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    toastSpy.mockClear();
  });

  it("归档云端那份后用新基线重推，本地内容不被覆盖", async () => {
    const mods = await load();
    await seedDirtyMirror(mods);

    let puts = 0;
    const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<Response>>(
      async (url) => {
        if (url === "/api/documents/d1/versions") return jsonRes({ created: true });
        puts++;
        return puts === 1
          ? jsonRes(
              {
                ok: false,
                conflict: true,
                doc: {
                  id: "d1",
                  title: "旅行笔记",
                  category: "随笔",
                  content: "另一台设备写的",
                  updatedAt: SERVER,
                },
              },
              409
            )
          : jsonRes({ ok: true, updatedAt: MERGED });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(mods.pushMirrorDoc("d1")).resolves.toBe(true);

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      "/api/documents/d1",
      "/api/documents/d1/versions",
      "/api/documents/d1",
    ]);

    const first = JSON.parse(fetchMock.mock.calls[0][1].body) as { baseUpdatedAt?: string };
    expect(first.baseUpdatedAt).toBe(BASE);
    const retry = JSON.parse(fetchMock.mock.calls[2][1].body) as {
      baseUpdatedAt?: string;
      content?: string;
    };
    expect(retry.baseUpdatedAt).toBe(SERVER); // 以云端当前版本为新基线
    expect(retry.content).toBe("本地改过的正文");

    const meta = mods.getMirrorMeta("d1")!;
    expect(meta.dirty).toBe(false);
    expect(meta.updatedAt).toBe(MERGED);
    expect(mods.getMirrorContent("d1")).toBe("本地改过的正文"); // 没被服务端那份盖掉
    expect(toastSpy).toHaveBeenCalledWith(
      "云端有另一份改动，已存为历史版本，本地内容已覆盖上去",
      "info"
    );
  });

  it("版本归档失败也照推，提示换成「历史版本没存下来」", async () => {
    const mods = await load();
    await seedDirtyMirror(mods);

    let puts = 0;
    const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<Response>>(
      async (url) => {
        if (url === "/api/documents/d1/versions") return jsonRes({ error: "存档失败" }, 500);
        puts++;
        return puts === 1
          ? jsonRes({ ok: false, conflict: true, doc: { id: "d1", updatedAt: SERVER } }, 409)
          : jsonRes({ ok: true, updatedAt: MERGED });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(mods.pushMirrorDoc("d1")).resolves.toBe(true);
    expect(mods.getMirrorMeta("d1")!.dirty).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      "云端有另一份改动，历史版本没存下来，本地内容已覆盖上去",
      "info"
    );
  });

  it("连着两次冲突就收手，dirty 留着下轮再推", async () => {
    const mods = await load();
    await seedDirtyMirror(mods);

    const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<Response>>(async (url) =>
      url === "/api/documents/d1/versions"
        ? jsonRes({ created: true })
        : jsonRes({ ok: false, conflict: true, doc: { id: "d1", updatedAt: SERVER } }, 409)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(mods.pushMirrorDoc("d1")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3); // PUT → versions → PUT，不再无限绕
    expect(mods.getMirrorMeta("d1")!.dirty).toBe(true);
    expect(mods.getMirrorContent("d1")).toBe("本地改过的正文");
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
