import { PERMISSIONS, type Permission } from "@/lib/permissionKeys";

/** The small 「AI」 badge beside the nickname in the account list: shown only if any AI feature is enabled; hover lists which */
export function PermissionBadge({ permissions }: { permissions: Permission[] | undefined }) {
  // If the API doesn't include this field yet (frontend and backend released out of step), treat it as not enabled and hide it
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
