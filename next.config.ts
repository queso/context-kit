import type { NextConfig } from "next"
import { getSecurityHeaders } from "@/lib/security-headers"

const nextConfig: NextConfig = {
  transpilePackages: ["reactive-swr"],
  // Standalone builds only ship traced files; migrations are read from disk at startup. Next
  // matches these keys with picomatch in `contains` mode, so "/" applies to every route ("/*"
  // would exclude the home route).
  outputFileTracingIncludes: { "/": ["./db/migrations/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ]
  },
}

export default nextConfig
