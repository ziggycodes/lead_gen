// LeadScout service worker. Only handles push notifications; no caching.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      // A focused LeadScout tab already shows the in-app "search finished" popup.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.focused && new URL(w.url).pathname.startsWith("/app"))) return;

      await self.registration.showNotification(data.title || "LeadScout", {
        body: data.body || "",
        icon: "/logo-120.png",
        badge: "/logo-120.png",
        tag: data.tag,
        data: { url: data.url || "/app" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).pathname.startsWith(target.pathname));
      if (existing) return existing.focus();
      return self.clients.openWindow(target.href);
    })()
  );
});
