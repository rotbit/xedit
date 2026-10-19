"use client";

import { useEffect, useRef, useState } from "react";
import { LOCAL_BACKEND_CHANGED_EVENT } from "@/lib/localBackend";
import {
  hasStoredVault,
  restoreVaultOnStartup,
  suspendVault,
  useVaultSession,
  type VaultState,
} from "@/lib/localBackend/vaultSession";
import { ALL } from "../constants";
import type { WorkspaceNav } from "./useWorkspaceNav";

export interface VaultBoot extends VaultState {
  /** Restoring the last library asynchronously: don't rush to render from browser storage meanwhile, or the landing page flashes for a frame */
  booting: boolean;
}

/**
 * Vault startup and library-switch cleanup: on entering local mode, try to restore the last opened folder;
 * whenever the backend changes (open/close a library), reset navigation — the doc being read belongs to the old library and its id doesn't exist in the new one.
 */
export function useVaultBoot({
  localMode,
  nav,
}: {
  localMode: boolean;
  nav: WorkspaceNav;
}): VaultBoot {
  const vault = useVaultSession();
  // The handle is in IndexedDB, so reading it takes an async round. On first entering local mode, use the sync flag to decide whether to wait
  const [boot, setBoot] = useState<"idle" | "waiting" | "done">("idle");
  if (localMode && boot === "idle") setBoot(hasStoredVault() ? "waiting" : "done");
  // Leaving local mode after login: back to idle, and decide again the next time we log out and come back
  if (!localMode && boot !== "idle") setBoot("idle");

  // After login the library is suspended (handle kept); restore it when logging out back into local mode
  useEffect(() => {
    if (!localMode) {
      void suspendVault();
      return;
    }
    void restoreVaultOnStartup().finally(() => setBoot("done"));
  }, [localMode]);

  // The library-switch callback only runs when the user clicks (necessarily after this render's effect), so syncing the ref in the effect is fresh enough
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  useEffect(() => {
    if (!localMode) return;
    const reset = () => {
      navRef.current.setReadingId(null);
      navRef.current.setActiveCat(ALL);
    };
    window.addEventListener(LOCAL_BACKEND_CHANGED_EVENT, reset);
    return () => window.removeEventListener(LOCAL_BACKEND_CHANGED_EVENT, reset);
  }, [localMode]);

  return { ...vault, booting: boot === "waiting" };
}
