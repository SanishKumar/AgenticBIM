import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: process.env.TRACE_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    proxyClientMaxBodySize: "26mb",
    proxyTimeout: 160_000,
  },
  async rewrites() {
    return [
      {
        source: "/api/ifc",
        destination: `${process.env.IFC_API_URL || "http://127.0.0.1:8000"}/api/analyze`,
      },
    ];
  },
};
export default nextConfig;
