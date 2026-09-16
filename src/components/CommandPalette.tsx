"use client";

// Obsidian 式命令面板（⌘⇧P）：打字即筛全站命令，↑↓ 选、↵ 执行，不用记菜单藏在哪。
// 命令本身由各宿主注册进 lib/commandRegistry，这里只管数据源与行渲染，
// 弹窗外壳（遮罩、输入框、列表、键盘导航）与快速切换器共用 PaletteShell。

import { useMemo, useState, useSyncExternalStore } from "react";
import { Command as CommandIcon } from "lucide-react";
import { PaletteShell } from "./PaletteShell";
import {
  commandsSnapshot,
  filterCommands,
  isAvailable,
  subscribeCommands,
  type Command,
} from "@/lib/commandRegistry";

const NONE: Command[] = [];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");

  // 注册表是模块级可变状态，订阅它拿快照（引用在注册表不变时稳定，不会触发无限重渲染）
  const all = useSyncExternalStore(subscribeCommands, commandsSnapshot, commandsSnapshot);

  // 每次打开都是一次全新的检索，上次的关键词不留到下一次。
  // 渲染期间带守卫地重置，放 effect 里会多跑一帧、弹窗先闪一下旧结果
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  // 命令表不读 localStorage，过滤纯粹是字符串比对，不必像切换器那样防抖。
  // open 进 deps 不只是省一次空跑：when() 的结果跟界面状态走，每次打开都要重新问一遍
  const hits = useMemo(
    () => (open ? filterCommands(all.filter(isAvailable), query) : NONE),
    [open, all, query]
  );

  /**
   * 先收面板再同步执行：格式类命令会把焦点抢回编辑器，此时输入框已不是 activeElement，
   * React 随后卸载它也就不会把焦点甩回 body。异步命令（复制/导出）也保持在用户手势这一拍里，
   * 否则 Safari 会判定剪贴板写入失去用户激活
   */
  const run = (cmd: Command) => {
    onClose();
    void (async () => cmd.run())().catch((e) => {
      // 命令自己负责给用户提示（toast），这里只兜住漏网的异常，别静默吞掉
      console.error("[command] 执行失败", cmd.id, e);
    });
  };

  return (
    <PaletteShell
      open={open}
      icon={<CommandIcon size={15} className="shrink-0 text-[var(--ink-faint)]" />}
      placeholder="搜索命令…"
      hint="↑↓ 选择 · ↵ 执行 · esc 关闭"
      query={query}
      onQueryChange={setQuery}
      resetKey={query}
      items={hits}
      keyOf={(cmd) => cmd.id}
      emptyText="没有匹配的命令"
      onPick={run}
      onClose={onClose}
      renderItem={(cmd) => (
        <>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">
            <span className="text-[var(--ink-faint)]">{cmd.group} › </span>
            {cmd.label}
          </span>
          {cmd.keys ? (
            <kbd className="shrink-0 font-sans text-[11px] text-[var(--ink-faint)]">{cmd.keys}</kbd>
          ) : null}
        </>
      )}
    />
  );
}
