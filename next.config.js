/** @type {import('next').NextConfig} */
const nextConfig = {
  // Added for BYOC: produces a self-contained server build the Dockerfile
  // can copy without shipping the full node_modules tree.
  output: "standalone",
};
module.exports = nextConfig;
