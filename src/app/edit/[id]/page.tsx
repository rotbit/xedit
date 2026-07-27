import { permanentRedirect } from "next/navigation";

/** 双屏编辑器已并入工作台；旧的文章编辑链接落到工作台内的该篇文章视图 */
export default async function EditDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/?doc=${encodeURIComponent(id)}`);
}
