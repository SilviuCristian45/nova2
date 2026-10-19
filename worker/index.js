self.addEventListener("activate", (event) => {
  // Remove private HTML/RSC caches left by the previous default PWA configuration.
  const privateCaches = new Set([
    "start-url", "pages", "pages-rsc", "pages-rsc-prefetch", "others",
    "apis", "next-data", "cross-origin",
  ]);
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => privateCaches.has(key)).map((key) => caches.delete(key)),
    )),
  );
});
