const CACHE = "old-school-pwa-v2";
const SEEN = "old-school-push-seen-v1";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([
        "/offline.html",
        "/assets/icon-192.png",
        "/assets/icon-512.png",
      ]);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("old-school-pwa-") && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
// Never cache order APIs, admin pages or customer HTML. Offline cannot submit orders.
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate" && event.request.method === "GET")
    event.respondWith(
      fetch(event.request).catch(async () => {
        return (await caches.match("/offline.html")) || Response.error();
      }),
    );
});
let pushWork = Promise.resolve();
self.addEventListener("push", (event) => {
  pushWork = pushWork
    .catch(() => {})
    .then(async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {}
      // Legacy payloadless pushes still show an honest generic status notification.
      if (!payload)
        payload = {
          title: "☕ Old School Coffee",
          body: "มีการอัปเดตออเดอร์ กรุณาตรวจสอบสถานะผ่านเว็บไซต์",
          data: { url: "/?view=orders" },
          tag: "old-school-status",
        };
      const eventId = payload.data?.eventId;
      const seen = await caches.open(SEEN);
      const marker = eventId
        ? new Request(
            self.location.origin +
              "/__push_seen/" +
              encodeURIComponent(eventId),
          )
        : null;
      if (marker && (await seen.match(marker))) return;
      await self.registration.showNotification("☕ Old School Coffee", {
        body: payload.body,
        icon: "/assets/icon-192.png",
        badge: "/assets/icon-192.png",
        tag: payload.tag || "old-school-status",
        data: payload.data || { url: "/?view=orders" },
        renotify: true,
        silent: false,
      });
      if (marker) {
        await seen.put(marker, new Response("seen"));
        const keys = await seen.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - 100)))
          await seen.delete(k);
      }
    });
  event.waitUntil(pushWork);
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      let staff = false;
      let url = new URL("/?view=orders", self.location.origin);
      try {
        const candidate = new URL(
          event.notification.data?.url,
          self.location.origin,
        );
        if (
          candidate.origin === self.location.origin &&
          (candidate.pathname === "/" ||
            (event.notification.data?.audience === "staff" && ["/admin", "/staff"].includes(candidate.pathname)))
        ) {
          url = candidate;
          staff = event.notification.data?.audience === "staff" && ["/admin", "/staff"].includes(candidate.pathname);
        }
      } catch {}
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Keep the staff workspace intact; only reuse a customer window.
      const existing = windows.find(
        (w) =>
          new URL(w.url).origin === url.origin &&
          (staff ? ["/admin", "/staff"].includes(new URL(w.url).pathname) : !/^\/(admin|staff)/.test(new URL(w.url).pathname)),
      );
      if (existing) {
        await existing.navigate(url.href);
        return existing.focus();
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
