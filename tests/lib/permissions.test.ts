import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 权限判定口径：管理员全开、封禁全关、其余看库里存的；以及后台提交权限列表时的清洗。
 * resolvePermissions 是纯函数，库换成空桩只为让 lib/permissions 能 import 进来。
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolvePermissions } from "@/lib/permissions";
import { cleanPermissions, knownPermissions } from "@/lib/permissionKeys";

const ADMIN = "boss@example.com";

beforeEach(() => vi.stubEnv("ADMIN_EMAILS", ADMIN));
afterEach(() => vi.unstubAllEnvs());

describe("resolvePermissions", () => {
  it("新用户（库里什么都没存）→ 一个都没有", () => {
    expect(resolvePermissions({ email: "a@example.com", bannedAt: null, permissions: [] })).toEqual([]);
  });

  it("普通用户按库里存的来，认不出的 key 丢掉", () => {
    expect(
      resolvePermissions({ email: "a@example.com", bannedAt: null, permissions: ["ai_cover", "retired_thing"] })
    ).toEqual(["ai_cover"]);
  });

  it("管理员不看库、一律全开；邮箱大小写不计较", () => {
    expect(resolvePermissions({ email: ADMIN.toUpperCase(), bannedAt: null, permissions: [] })).toEqual([
      "ai_review",
      "ai_cover",
    ]);
  });

  it("被封禁的一律全关，库里存了也不算", () => {
    expect(
      resolvePermissions({ email: "a@example.com", bannedAt: new Date(), permissions: ["ai_review", "ai_cover"] })
    ).toEqual([]);
  });

  it("没邮箱的账号不会被当成管理员", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(resolvePermissions({ email: null, bannedAt: null, permissions: ["ai_review"] })).toEqual(["ai_review"]);
  });
});

describe("cleanPermissions", () => {
  it("合法列表去重后照收，空数组也合法（= 全部收回）", () => {
    expect(cleanPermissions(["ai_review", "ai_cover", "ai_review"])).toEqual(["ai_review", "ai_cover"]);
    expect(cleanPermissions([])).toEqual([]);
  });

  it("不是数组、或混进认不出的 key → null", () => {
    expect(cleanPermissions("ai_review")).toBeNull();
    expect(cleanPermissions(null)).toBeNull();
    expect(cleanPermissions({ 0: "ai_review" })).toBeNull();
    expect(cleanPermissions(["ai_review", "admin"])).toBeNull();
    expect(cleanPermissions(["ai_review", 1])).toBeNull();
  });
});

describe("knownPermissions", () => {
  it("库里读出的空值、未知 key 都能兜住", () => {
    expect(knownPermissions(null)).toEqual([]);
    expect(knownPermissions(undefined)).toEqual([]);
    expect(knownPermissions(["x", "ai_review"])).toEqual(["ai_review"]);
  });
});
