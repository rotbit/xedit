/**
 * Per-account feature permission list. Shared by frontend and backend: no database access here, so the browser can import it too.
 * Adding a permission is one line in PERMISSIONS; the database stores an array of keys (User.permissions), no schema change.
 * The decision rules (admins get everything, banned users nothing) live in lib/permissions, which pulls in prisma and is server-only.
 */

import { tk } from "@/i18n/t";

export const PERMISSIONS = [
  { key: "ai_review", label: tk("AI 审核"), hint: tk("在编辑器里用 AI 检查表述与公众号合规") },
  { key: "ai_cover", label: tk("AI 生成封面"), hint: tk("用 AI 生成公众号封面图，按张计费") },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

const KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);

export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && KEYS.includes(v);
}

/** Permission list submitted by an admin: null if not an array or containing unknown keys (so the API returns 400), else de-duplicated */
export function cleanPermissions(v: unknown): Permission[] | null {
  if (!Array.isArray(v) || !v.every(isPermission)) return null;
  return [...new Set(v)];
}

/** Values read from the database: unknown keys (e.g. retired permissions) are silently dropped */
export function knownPermissions(v: readonly string[] | null | undefined): Permission[] {
  return (v ?? []).filter(isPermission);
}
