import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const isDev = process.env.NODE_ENV === "development"
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: isDev, // Oprim PWA în dev ca să nu ne blocheze cache-ul când scriem cod
});

const nextConfig: NextConfig = {
  turbopack: {},
  /* config options here */
};

export default isDev ? nextConfig : withPWA(nextConfig);