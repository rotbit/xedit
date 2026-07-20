/**
 * 离线壳缓存（完全本地优先的界面层）：
 * 页面导航网络优先、离线回退缓存（精确路径 → 首页壳）；
 * _next/static 等带哈希的静态资源缓存优先；
 * /api/ 一律不缓存——数据的离线能力由 localStorage 镜像库负责。
 * 网页版与桌面壳（Electron 加载 xedit.me）共用这一套，桌面端无需发版。
 */

const CACHE = "xedit-offline-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 跨域资源（图床等）不接管
  if (url.pathname.startsWith("/api/")) return; // 数据请求不缓存
  if (url.searchParams.has("_rsc")) return; // RSC 软导航失败时 Next 会自动回退整页导航

  // 页面导航：网络优先，离线回退缓存
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE);
            void cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req, { ignoreSearch: true });
          return cached ?? (await caches.match("/")) ?? Response.error();
        }
      })()
    );
    return;
  }

  // 静态资源：缓存优先（_next/static 带内容哈希，天然不腐）
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (url.pathname.startsWith("/_next/") || url.pathname === "/favicon.ico")) {
          const cache = await caches.open(CACHE);
          void cache.put(req, res.clone());
        }
        return res;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) ?? Response.error();
      }
    })()
  );
});
