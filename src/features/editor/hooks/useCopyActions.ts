"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { toast } from "@/components/Toast";
import { buildRenderOptions } from "../lib/renderOptions";

export type CopyTarget = "wechat" | "zhihu";

/** 一键复制：产出各平台富文本并写入剪贴板，复制中禁用按钮 */
export function useCopyActions() {
  const [copying, setCopying] = useState<CopyTarget | null>(null);

  // 开发环境暴露构建函数，便于在控制台检查复制产物
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__xeditBuildWechat = async () =>
      buildWechatHtml(useStore.getState().content, await buildRenderOptions());
    (window as unknown as Record<string, unknown>).__xeditBuildZhihu = () =>
      buildZhihuHtml(useStore.getState().content);
  }, []);

  const copy = async (
    target: CopyTarget,
    build: (content: string) => Promise<string>,
    okMessage: string
  ) => {
    setCopying(target);
    try {
      const content = useStore.getState().content;
      await copyRichHtml(await build(content), content);
      toast(okMessage, "success");
    } catch (e) {
      toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCopying(null);
    }
  };

  return {
    copying,
    copyWechat: () =>
      copy(
        "wechat",
        async (content) => buildWechatHtml(content, await buildRenderOptions()),
        "已复制！打开公众号后台编辑器直接粘贴"
      ),
    copyZhihu: () =>
      copy("zhihu", (content) => buildZhihuHtml(content), "已复制！打开知乎编辑器直接粘贴"),
  };
}
