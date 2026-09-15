import { useStore } from "@/store/useStore";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { toast } from "@/components/Toast";
import { buildRenderOptions } from "./renderOptions";

export type CopyTarget = "wechat" | "zhihu";

const DONE: Record<CopyTarget, string> = {
  wechat: "已复制！打开公众号后台编辑器直接粘贴",
  zhihu: "已复制！打开知乎编辑器直接粘贴",
};

/**
 * 按当前排版主题把全文复制成富文本。
 * 顶栏的复制菜单（ReaderActions）与命令面板都调这里，逻辑只此一份；
 * 「复制中」的按钮态属于菜单自己的 UI，留在 ReaderActions。
 */
export async function copyDoc(target: CopyTarget): Promise<void> {
  try {
    const s = useStore.getState();
    // 知乎那边不吃自定义主题（粘贴后由知乎重排），所以不必备渲染选项
    const html =
      target === "wechat"
        ? await buildWechatHtml(s.content, await buildRenderOptions())
        : await buildZhihuHtml(s.content);
    await copyRichHtml(html, s.content);
    toast(DONE[target], "success");
  } catch (e) {
    toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
  }
}
