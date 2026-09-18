import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "../setup";
import { clearAuthSnapshot } from "@/lib/authSnapshot";
import { getMirrorMeta, saveMirrorLocal } from "@/lib/docStore";
import { isSyncHeld, setMirrorOwner } from "@/lib/mirrorOwner";
import { ORPHAN_DRAFTS_KEY, resolveAccountSwitch } from "@/lib/orphanDrafts";

const A = { id: "u-a", email: "a@example.com" };
const B = { id: "u-b", email: "b@example.com" };

beforeEach(() => {
  clearAuthSnapshot();
});

describe("换账号但草稿挪不走时的推送闸门", () => {
  it("stash 写失败 → 上闸，镜像原样；sync 的推送一个字不发；旧主人回来落定后开闸", async () => {
    setMirrorOwner(A);
    saveMirrorLocal("d1", { title: "旧主人的稿", content: "正文" });
    storage.failSetIf = (key) => key === ORPHAN_DRAFTS_KEY;

    const r = resolveAccountSwitch(B);
    expect(r.stashFailed).toBe(true);
    expect(getMirrorMeta("d1")?.dirty).toBe(true);
    expect(isSyncHeld()).toBe(true);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { pushMirrorDoc, syncNow } = await import("@/lib/sync");
    expect(await pushMirrorDoc("d1")).toBe(false);
    await syncNow();
    // 拉取可以照常（GET），但没有任何 PUT/POST 带着旧主人的内容出去
    const writes = fetchMock.mock.calls.filter(
      (c) => c[1] && ["PUT", "POST"].includes((c[1] as RequestInit).method ?? "GET")
    );
    expect(writes).toHaveLength(0);

    storage.failSetIf = null;
    const back = resolveAccountSwitch(A);
    expect(back.ownership).toBe("same");
    expect(isSyncHeld()).toBe(false);
  });
});
