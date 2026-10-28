import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  // Build kontroluje typy jen kódu aplikace; testy a skripty hlídá `pnpm typecheck`.
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
