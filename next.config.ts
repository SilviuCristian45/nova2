import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const isDev = process.env.NODE_ENV === "development"
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  fallbacks: { document: "/offline" },
  workboxOptions: {
    skipWaiting: false,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/_next/static/"),
        handler: "CacheFirst",
        options: { cacheName: "replog-static-v1", expiration: { maxEntries: 256, maxAgeSeconds: 60 * 60 * 24 * 30 } },
      },
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkOnly",
        options: {},
      },
    ],
  },
  disable: isDev, // Oprim PWA în dev ca să nu ne blocheze cache-ul când scriem cod
});

const nextConfig: NextConfig = {
  turbopack: {},
  /* config options here */
  allowedDevOrigins: ['192.168.88.158', 'unburned-unbargained-marsha.ngrok-free.dev']
};

export default isDev ? nextConfig : withPWA(nextConfig);