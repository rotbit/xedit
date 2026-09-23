import { PERMISSIONS, type Permission } from "@/lib/permissionKeys";

/** 账号列表里昵称旁的「AI」小标：开通了任一 AI 功能才显示，悬停列出开了哪几项 */
export function PermissionBadge({ permissions }: { permissions: Permission[] | undefined }) {
  // 接口还没带上这个字段（前后端错开发布）时按没开通处理，不显示
  if (!permissions?.length) return null;
  const labels = PERMISSIONS.filter((p) => permissions.includes(p.key)).map((p) => p.label);
  return (
    <span
      className="shrink-0 rounded-full bg-[var(--accent-wash)] px-1.5 py-px text-[10.5px] font-medium leading-4 text-[var(--accent-deep,var(--accent))]"
      title={`已开通：${labels.join("、")}`}
    >
      AI
    </span>
  );
}
