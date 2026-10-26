import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const listeners = {},
  stores = new Map(),
  shown = [],
  navigated = [],
  opened = [];
let focused = 0;
const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      async match(k) {
        return m.get(k.url || k);
      },
      async put(k, v) {
        m.set(k.url || k, v);
      },
      async keys() {
        return [...m.keys()].map((k) => new Request(k));
      },
      async delete(k) {
        return m.delete(k.url || k);
      },
      async addAll(urls) {
        for (const u of urls) m.set("https://cafe.test" + u, new Response(u));
      },
    };
  },
  async keys() {
    return [...stores.keys()];
  },
  async delete(k) {
    return stores.delete(k);
  },
  async match(url) {
    for (const m of stores.values()) {
      const r = m.get("https://cafe.test" + url);
      if (r) return r;
    }
    return undefined;
  },
};
const self = {
  location: { origin: "https://cafe.test" },
  addEventListener(name, fn) {
    listeners[name] = fn;
  },
  async skipWaiting() {},
  registration: {
    async showNotification(title, options) {
      shown.push({ title, ...options });
    },
  },
  clients: {
    async claim() {},
    async matchAll() {
      return [
        {
          url: "https://cafe.test/admin",
          async navigate(url) {
            navigated.push(url);
          },
          async focus() {
            focused++;
          },
        },
      ];
    },
    async openWindow(url) {
      opened.push(url);
    },
  },
};
vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
  self,
  caches,
  Request,
  Response,
  URL,
  Promise,
  fetch: async () => {
    throw new Error("offline");
  },
});
async function event(type, data) {
  const pending = [];
  const e = {
    ...data,
    waitUntil(p) {
      pending.push(p);
    },
  };
  listeners[type](e);
  await Promise.all(pending);
}
await event("install");
await event("activate");
const token = crypto.randomUUID(),
  payload = {
    body: "เครื่องดื่มของคุณพร้อมแล้ว! ออเดอร์ #OS-1234 กรุณามารับที่เคาน์เตอร์ครับ",
    tag: "old-school-OS-1234",
    data: { url: "/?view=orders#order=" + token, eventId: "ready:1234" },
  };
await event("push", { data: { json: () => payload } });
await event("push", { data: { json: () => payload } });
assert.equal(shown.length, 1);
assert.equal(shown[0].title, "☕ Old School Coffee");
assert.equal(shown[0].body, payload.body);
await event("push", {
  data: {
    json: () => ({
      ...payload,
      data: { ...payload.data, eventId: "manual:1234" },
    }),
  },
});
assert.equal(shown.length, 2);
await event("notificationclick", {
  notification: { data: payload.data, close() {} },
});
assert.equal(navigated.length, 0);
assert.equal(opened[0], "https://cafe.test/?view=orders#order=" + token);
self.clients.matchAll = async () => [
  {
    url: "https://cafe.test/?view=orders",
    async navigate(u) {
      navigated.push(u);
    },
    async focus() {
      focused++;
    },
  },
];
await event("notificationclick", {
  notification: { data: payload.data, close() {} },
});
assert.equal(navigated[0], opened[0]);
assert.equal(focused, 1);
await event("notificationclick", {
  notification: { data: { url: "https://evil.test/steal" }, close() {} },
});
assert.equal(navigated.at(-1), "https://cafe.test/?view=orders");
// Staff notification reuses only a staff window and carries no customer tracking token.
const shop = {
  url: "/admin?view=orders",
  audience: "staff",
  eventId: "staff-new:9",
};
await event("push", {
  data: { json: () => ({ body: "มีออเดอร์ใหม่", data: shop, tag: "staff-9" }) },
});
assert.equal(shown.at(-1).silent, false);
const beforeOpened = opened.length;
await event("notificationclick", { notification: { data: shop, close() {} } });
assert.equal(
  opened.length,
  beforeOpened + 1,
  "customer window must not be replaced by workspace",
);
assert.equal(opened.at(-1), "https://cafe.test/admin?view=orders");
self.clients.matchAll = async () => [
  {
    url: "https://cafe.test/admin",
    async navigate(u) {
      navigated.push(u);
    },
    async focus() {
      focused++;
    },
  },
];
await event("notificationclick", { notification: { data: shop, close() {} } });
assert.equal(navigated.at(-1), "https://cafe.test/admin?view=orders");
await event("notificationclick", {
  notification: {
    data: { url: "https://evil.test/admin", audience: "staff" },
    close() {},
  },
});
assert.equal(opened.at(-1), "https://cafe.test/?view=orders");
let response;
listeners.fetch({
  request: { mode: "navigate", method: "GET" },
  respondWith(p) {
    response = p;
  },
});
assert.equal(await (await response).text(), "/offline.html");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest"));
assert.equal(manifest.name, "Old School Coffee");
assert.equal(manifest.display, "standalone");
for (const icon of manifest.icons) {
  const bytes = fs.readFileSync("public" + icon.src);
  assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
}
console.log(
  "PASS: PWA manifest/icons; offline fallback; push payload displayed without cookie fetch; persistent event dedupe; manual repeat; exact order deep link; staff window preserved; cross-origin click blocked.",
);
