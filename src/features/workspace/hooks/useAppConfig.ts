"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "../types";

/** Deployment flags are process-level constants, fetched once per session: multiple mount points (workspace, login dialog) share this promise */
let configPromise: Promise<AppConfig | null> | null = null;

function loadConfig(): Promise<AppConfig | null> {
  configPromise ??= fetch("/api/config")
    .then((r) => r.json() as Promise<AppConfig>)
    .catch(() => {
      // Don't cache failures: the next mount point can retry (the dialog's second open may have network)
      configPromise = null;
      return null;
    });
  return configPromise;
}

/** Deployment capability flags (whether OSS / third-party login are configured) */
export function useAppConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let alive = true;
    void loadConfig().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
