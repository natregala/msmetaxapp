import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.MSME_BUILD_DIR || ".next",
};
export default config;
