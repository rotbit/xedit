import { permanentRedirect } from "next/navigation";

/** 双屏编辑器已并入工作台；老链接与桌面端「新建文章」菜单落到工作台并直接建稿 */
export default function LocalEditPage() {
  permanentRedirect("/?new=1");
}
