import type { NextConfig } from 'next';

// better-sqlite3 is a native addon that locates better_sqlite3.node at runtime by
// walking up from its own file location. Bundling it into the server output breaks
// that lookup ("Could not locate the bindings file", pointing at @prisma/client),
// so it and the adapter that loads it must be required from node_modules instead.
const NATIVE_SERVER_PACKAGES = ['better-sqlite3', '@prisma/adapter-better-sqlite3'];

const nextConfig: NextConfig = {
  experimental: {
    useWasmBinary: true,
  },
  serverExternalPackages: NATIVE_SERVER_PACKAGES,
};

export default nextConfig;
