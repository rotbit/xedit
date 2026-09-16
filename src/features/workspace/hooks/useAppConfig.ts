"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "../types";

/** 部署侧开关是进程级常量，一个会话只拉一次：多个挂载点（工作台、登录弹窗）共用这个 promise */
let configPromise: Promise<AppConfig | null> | null = null;

function loadConfig(): Promise<AppConfig | null> {
  configPromise ??= fetch("/api/config")
    .then((r) => r.json() as Promise<AppConfig>)
    .catch(() => {
      // 失败不缓存：下一个挂载点还能重试（弹窗第二次打开就可能有网了）
      configPromise = null;
      return null;
    });
  return configPromise;
}

/** 部署侧能力开关（OSS / 第三方登录是否配置） */
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
