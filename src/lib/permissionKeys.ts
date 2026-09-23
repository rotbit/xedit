/**
 * 按账号开通的功能权限清单。前后端共用：这里不碰数据库，浏览器那边也能 import。
 * 加一项新权限只需往 PERMISSIONS 里加一行，库里存的是 key 数组（User.permissions），不用改表。
 * 判定口径（管理员全开、封禁全关）在 lib/permissions，那边连着 prisma，只在服务端用。
 */

export const PERMISSIONS = [
  { key: "ai_review", label: "AI 审核", hint: "在编辑器里用 AI 检查表述与公众号合规" },
  { key: "ai_cover", label: "AI 生成封面", hint: "用 AI 生成公众号封面图，按张计费" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

const KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);

export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && KEYS.includes(v);
}

/** 管理员提交的权限列表：不是数组或混进认不出的 key 就返回 null（让接口报 400），否则去重 */
export function cleanPermissions(v: unknown): Permission[] | null {
  if (!Array.isArray(v) || !v.every(isPermission)) return null;
  return [...new Set(v)];
}

/** 库里读出来的值：认不出的 key（比如下线了的权限）静默丢掉 */
export function knownPermissions(v: readonly string[] | null | undefined): Permission[] {
  return (v ?? []).filter(isPermission);
}
