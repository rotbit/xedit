import { permanentRedirect } from "next/navigation";

/** The split-screen editor was merged into the workspace; old links and the desktop app's 「新建文章」 (New article) menu land in the workspace and create a draft right away */
export default function LocalEditPage() {
  permanentRedirect("/?new=1");
}
