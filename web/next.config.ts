import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/app",
  output: "standalone",
  trailingSlash: true,
};

export default nextConfig;
