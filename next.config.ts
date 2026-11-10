import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output (.next/standalone) for Docker deployment
  output: "standalone",
  // ali-oss and its deps (urllib etc.) use dynamic require at runtime; let Node load them directly instead of bundling
  serverExternalPackages: ["ali-oss"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }];
  },
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
