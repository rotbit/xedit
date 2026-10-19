import { permanentRedirect } from "next/navigation";

/** The split-screen editor was merged into the workspace; old article edit links land on that article's view in the workspace */
export default async function EditDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/?doc=${encodeURIComponent(id)}`);
}
