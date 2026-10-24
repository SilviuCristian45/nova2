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

// Tapping the rest-timer notification brings the open app back instead of doing nothing.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => "focus" in client);
      return open ? open.focus() : self.clients.openWindow("/insert");
    }),
  );
});
