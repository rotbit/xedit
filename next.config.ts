import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署用独立产物（.next/standalone）
  output: "standalone",
  // ali-oss 及其依赖（urllib 等）包含运行时动态 require，交给 Node 直接加载，不参与打包
  serverExternalPackages: ["ali-oss"],
  // MCP OAuth 发现文档必须挂在根域 /.well-known 下（RFC 8414 / 9728），
  // 用 rewrite 落到实际的 route handler。带 :path* 兼容「资源路径后缀」变体。
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/meta/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/meta/authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/meta/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/meta/protected-resource",
      },
    ];
  },
};

export default nextConfig;
