/** @type {import('next').NextConfig} */
const nextConfig = {
  // Added for BYOC: produces a self-contained server build the Dockerfile
  // can copy without shipping the full node_modules tree.
  output: "standalone",
  allowedDevOrigins: [
    "**.run.app",
    "**.google.com",
    "**.googlers.com",
    "localhost",
    "127.0.0.1",
  ],
};
module.exports = nextConfig;
