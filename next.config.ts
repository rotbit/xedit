import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署用独立产物（.next/standalone）
  output: "standalone",
  // ali-oss 及其依赖（urllib 等）包含运行时动态 require，交给 Node 直接加载，不参与打包
  serverExternalPackages: ["ali-oss"],
};

export default nextConfig;
