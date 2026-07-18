import { EditorApp } from "@/components/App";

export default async function EditDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditorApp docId={id} />;
}
