import type { NextConfig } from "next";
const nextConfig: NextConfig = {
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
