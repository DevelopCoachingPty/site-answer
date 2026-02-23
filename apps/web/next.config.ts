import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  transpilePackages: ["@site-answer/shared"],
};

export default nextConfig;
