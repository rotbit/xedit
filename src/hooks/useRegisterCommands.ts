"use client";

import { useEffect, useRef, type DependencyList } from "react";
import { registerCommands, type Command } from "@/lib/commandRegistry";

/**
 * Registers a set of commands in the global registry and unregisters them on unmount (or when deps change).
 *
 * run / when always go through a ref to get the current render's closure, so deps only need to express "did the command table itself change"
 * (most hosts have a static table, so [] works); no need to list the dozen values the callbacks use --
 * that would unregister and re-register on every render, which is wasteful and also moves the batch to the end of the list, shuffling the palette order.
 */
export function useRegisterCommands(cmds: Command[], deps: DependencyList) {
  const latest = useRef(cmds);
  // Sync the latest closures after each render; the registration effect is declared later, so it already sees new values when deps change
  useEffect(() => {
    latest.current = cmds;
  });

  useEffect(() => {
    // What gets registered is a shell: id / label / keys are taken at registration time (the table is static),
    // while run and when look up the latest version by id on every call, so stale closures never run
    const shell = latest.current.map((cmd) => {
      const current = () => latest.current.find((c) => c.id === cmd.id) ?? cmd;
      return {
        ...cmd,
        run: () => current().run(),
        when: cmd.when ? () => current().when?.() ?? true : undefined,
      };
    });
    return registerCommands(shell);
    // deps come from the caller: it knows when the command table really changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
