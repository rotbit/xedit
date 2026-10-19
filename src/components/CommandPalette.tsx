"use client";

// Obsidian-style command palette (⌘⇧P): type to filter every command, ↑↓ to select, ↵ to run — no need to remember which menu hides what.
// Commands are registered into lib/commandRegistry by each host; this only handles the data source and row rendering;
// the dialog shell (backdrop, input, list, keyboard navigation) is the PaletteShell shared with the quick switcher.

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
import { useT } from "@/i18n/useT";

const NONE: Command[] = [];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");

  // The registry is module-level mutable state; subscribe for a snapshot (the reference is stable while the registry is unchanged, so no render loop)
  const all = useSyncExternalStore(subscribeCommands, commandsSnapshot, commandsSnapshot);

  // Each open is a fresh search; the previous query doesn't carry over.
  // Reset during render behind a guard; doing it in an effect costs an extra frame and briefly flashes the old results
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  // The command list doesn't touch localStorage and filtering is plain string matching, so no debounce like the switcher.
  // open is in the deps for more than skipping an empty run: when() results follow UI state, so re-ask on every open
  const hits = useMemo(
    () => (open ? filterCommands(all.filter(isAvailable), query) : NONE),
    [open, all, query]
  );

  /**
   * Close the palette first, then run synchronously: formatting commands pull focus back to the editor, so the input is no longer activeElement
   * and React unmounting it won't throw focus back to body. Async commands (copy/export) also stay within this user-gesture tick,
   * otherwise Safari decides the clipboard write has lost user activation
   */
  const run = (cmd: Command) => {
    onClose();
    void (async () => cmd.run())().catch((e) => {
      // Commands show their own toasts; this only catches stray exceptions so they aren't silently swallowed
      console.error("[command] 执行失败", cmd.id, e);
    });
  };

  return (
    <PaletteShell
      open={open}
      icon={<CommandIcon size={16} className="shrink-0 text-[var(--ink-faint)]" />}
      placeholder={t("搜索命令…")}
      hint={t("↑↓ 选择 · ↵ 执行 · esc 关闭")}
      query={query}
      onQueryChange={setQuery}
      resetKey={query}
      items={hits}
      keyOf={(cmd) => cmd.id}
      emptyText={t("没有匹配的命令")}
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
