import type { EditorView } from "@codemirror/view";
import type { FormatCommand } from "@/lib/editorCommands";

/** 选区快照：浮动工具条据此决定出现/隐藏与落点 */
export interface SelectionInfo {
  from: number;
  to: number;
  empty: boolean;
  /** 编辑器当前是否持有焦点（失焦要收起工具条，除非焦点落在工具条自己身上） */
  hasFocus: boolean;
  /** 本次上报是否伴随文档变化（打字时要收起工具条） */
  docChanged: boolean;
}

export interface EditorHandle {
  /** 切换阅读前同步最后一次输入，不触发版本保存。 */
  flush: () => void;
  /** arg：color 命令的色值（缺省 = 清除颜色），其余命令忽略 */
  applyFormat: (cmd: FormatCommand, arg?: string) => void;
  view: () => EditorView | null;
  /** 跳转到指定行（0 基）：移动光标并平滑滚动，大纲点击用 */
  scrollToLine: (line: number) => void;
  /** 只把某行滚到容器顶端，不动光标、不抢焦点（预览→编辑器的同步滚动用） */
  scrollLineToTop: (line: number) => void;
}
