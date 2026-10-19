import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output (.next/standalone) for Docker deployment
  output: "standalone",
  // ali-oss and its deps (urllib etc.) use dynamic require at runtime; let Node load them directly instead of bundling
  serverExternalPackages: ["ali-oss"],
  // MCP OAuth discovery documents must live under the root /.well-known (RFC 8414 / 9728),
  // so rewrite them to the actual route handlers. :path* covers the "resource path suffix" variant.
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
