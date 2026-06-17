/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // Keep native/node-only deps out of the bundle; they run only on the server.
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "dockerode",
      "archiver",
      "googleapis",
      "dropbox",
      "node-cron",
    ],
    // Run instrumentation.ts on the Node.js server (starts the scheduler).
    instrumentationHook: true,
  },
};

export default nextConfig;
