import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "../setup";
import { clearAuthSnapshot, saveAuthSnapshot } from "@/lib/authSnapshot";
import { getMirrorContent, getMirrorMeta, saveMirrorLocal } from "@/lib/docStore";
import { readMirrorOwner, setMirrorOwner } from "@/lib/mirrorOwner";
import {
  listOrphanDrafts,
  ORPHAN_DRAFTS_KEY,
  reclaimOrphanDrafts,
  resolveAccountSwitch,
  stashAndDetachMirror,
} from "@/lib/orphanDrafts";
import { getSessionEpoch } from "@/lib/sessionEpoch";

const A = { id: "u-a", email: "a@example.com", name: "A" };
const B = { id: "u-b", email: "b@example.com", name: "B" };

beforeEach(() => {
  // The snapshot module has an in-process cache; without clearing it between tests the previous case's identity leaks in
  clearAuthSnapshot();
});

/** Create a mirror article that was "edited locally but not yet pushed to the cloud" */
function makeDirtyDoc(id = "d1") {
  saveMirrorLocal(id, { title: "没推上去的稿子", content: "正文正文", category: "随笔" });
}

describe("换账号时的镜像归属", () => {
  it("换人：dirty 草稿进孤儿列表，镜像清空，归属换成新账号", () => {
    setMirrorOwner(A);
    makeDirtyDoc();
    const epochBefore = getSessionEpoch();

    const r = resolveAccountSwitch(B);

    expect(r.ownership).toBe("different");
    expect(r.stashed).toBe(1);
    expect(r.cleared).toBe(true);
    expect(r.stashFailed).toBe(false);
    // It's gone from the mirror
    expect(getMirrorMeta("d1")).toBeNull();
    expect(getMirrorContent("d1")).toBeNull();
    // But the content and the old ownership are kept
    const orphans = listOrphanDrafts();
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({
      id: "d1",
      title: "没推上去的稿子",
      content: "正文正文",
      category: "随笔",
      owner: { id: A.id, email: A.email },
    });
    expect(readMirrorOwner()).toEqual({ id: B.id, email: B.email });
    expect(getSessionEpoch()).toBeGreaterThan(epochBefore);
  });

  it("旧账号再登录：草稿写回镜像并标 dirty，孤儿列表清空", () => {
    setMirrorOwner(A);
    makeDirtyDoc();
    resolveAccountSwitch(B);

    const back = resolveAccountSwitch(A);

    expect(back.reclaimed).toBe(1);
    expect(getMirrorMeta("d1")).toMatchObject({ title: "没推上去的稿子", dirty: true });
    expect(getMirrorContent("d1")).toBe("正文正文");
    expect(listOrphanDrafts()).toHaveLength(0);
    expect(readMirrorOwner()).toEqual({ id: A.id, email: A.email });
  });

  it("归属未知 + dirty：不认领也不删，草稿记成 unknown 组", () => {
    // No ownership record and no account snapshot (upgraded from an old version, or the snapshot was cleared by the probe)
    makeDirtyDoc();

    const r = resolveAccountSwitch(B);

    expect(r.ownership).toBe("unknown");
    expect(r.stashed).toBe(1);
    expect(r.reclaimed).toBe(0); // A new account must not claim drafts of unknown origin
    expect(getMirrorMeta("d1")).toBeNull();
    expect(listOrphanDrafts()[0].owner).toEqual({ unknown: true });
    // Nobody can claim it, whoever signs in
    expect(reclaimOrphanDrafts(B)).toBe(0);
    expect(reclaimOrphanDrafts(A)).toBe(0);
    expect(readMirrorOwner()).toEqual({ id: B.id, email: B.email });
  });

  it("孤儿列表写不进去（配额满）：镜像原样保留，不清", () => {
    setMirrorOwner(A);
    makeDirtyDoc();
    storage.failSetIf = (key) => key === ORPHAN_DRAFTS_KEY;

    const r = resolveAccountSwitch(B);

    expect(r.stashFailed).toBe(true);
    expect(r.cleared).toBe(false);
    expect(getMirrorContent("d1")).toBe("正文正文");
    expect(getMirrorMeta("d1")?.dirty).toBe(true);
    // Ownership still points at the previous user: the next sign-in will try again
    expect(readMirrorOwner()).toEqual({ id: A.id, email: A.email });
  });

  it("同一个人：镜像照用，顺手领回上次没推上去的草稿", () => {
    setMirrorOwner(A);
    makeDirtyDoc();
    resolveAccountSwitch(B); // A's drafts are moved out first
    saveMirrorLocal("d2", { title: "B 的文章", content: "bbb" });

    const again = resolveAccountSwitch(B);

    expect(again.ownership).toBe("same");
    expect(again.cleared).toBe(false);
    expect(getMirrorContent("d2")).toBe("bbb"); // B's own data is untouched
    expect(again.reclaimed).toBe(0);
  });

  it("老版本升级：没有归属记录但有账号快照时，归属按快照认", () => {
    saveAuthSnapshot(A);
    makeDirtyDoc();

    const r = resolveAccountSwitch(A);

    expect(r.ownership).toBe("same");
    expect(getMirrorContent("d1")).toBe("正文正文"); // Its own cache isn't cleared
    expect(readMirrorOwner()).toEqual({ id: A.id, email: A.email });
  });
});

describe("登出交接", () => {
  it("登出：草稿落袋后清镜像与归属", () => {
    setMirrorOwner(A);
    makeDirtyDoc();

    expect(stashAndDetachMirror()).toBe(true);

    expect(getMirrorMeta("d1")).toBeNull();
    expect(listOrphanDrafts()[0].owner).toEqual({ id: A.id, email: A.email });
    expect(storage.getItem("xedit-mirror-owner")).toBeNull();
  });

  it("登出时存不下草稿：返回 false，镜像不清", () => {
    setMirrorOwner(A);
    makeDirtyDoc();
    storage.failSetIf = (key) => key === ORPHAN_DRAFTS_KEY;

    expect(stashAndDetachMirror()).toBe(false);
    expect(getMirrorContent("d1")).toBe("正文正文");
  });
});
