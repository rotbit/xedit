"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "../types";

/** 部署侧能力开关（OSS / 第三方登录是否配置） */
export function useAppConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  return config;
}
