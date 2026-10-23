self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) =>
  e.waitUntil(
    (async () => {
      let text = "เครื่องดื่มของคุณพร้อมรับแล้ว กรุณาตรวจสอบออเดอร์";
      try {
        const r = await fetch("/api/pos?action=mine", {
          credentials: "include",
        });
        const d = await r.json();
        const ready = d.orders?.filter((o) => o.status === "ready");
        if (ready?.length)
          text =
            ready.map((o) => o.number).join(", ") + " พร้อมรับที่เคาน์เตอร์";
      } catch {}
      await self.registration.showNotification("OLD SCHOOL • พร้อมรับแล้ว", {
        body: text,
        icon: "/assets/icon-192.png",
        badge: "/assets/icon-192.png",
        tag: "order-ready",
        data: { url: "/?view=orders" },
      });
    })(),
  ),
);
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((w) => {
      if (w.length) {
        w[0].navigate("/?view=orders");
        return w[0].focus();
      }
      return clients.openWindow("/?view=orders");
    }),
  );
});
