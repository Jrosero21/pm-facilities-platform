import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phase (iii) Part 1 — operator vendor-invoice DOCUMENT uploads (PDF/scans) route bytes through
    // the server action, so the default 1 MB Server Action body cap is too small. Raise to 16 MB
    // (the per-file upload cap is 15 MB at the action, leaving multipart-overhead headroom).
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
