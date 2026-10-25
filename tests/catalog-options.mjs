import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const base = "http://localhost:5173";
function client() {
  let cookie = "";
  return async (action, data) => {
    const r = await fetch(
      base + "/api/pos" + (data ? "" : "?action=" + action),
      {
        method: data ? "POST" : "GET",
        headers: {
          Cookie: cookie,
          ...(data ? { "Content-Type": "application/json", Origin: base } : {}),
        },
        ...(data ? { body: JSON.stringify({ action, ...data }) } : {}),
      },
    );
    const c = r.headers.get("set-cookie");
    if (c)
      cookie = [
        ...cookie
          .split("; ")
          .filter((x) => x && !x.startsWith(c.split("=")[0] + "=")),
        c.split(";")[0],
      ].join("; ");
    return { status: r.status, ...(await r.json()) };
  };
}
const admin = client(),
  guest = client();
assert.equal(
  (
    await admin("login", {
      username: "owner",
      password: fs.readFileSync(".test-password", "utf8"),
    })
  ).status,
  200,
);
const { config: original } = await admin("admin");
await guest("menu");
const product = {
  id: "test-bakery-" + crypto.randomUUID(),
  name: "ครัวซองต์ทดสอบ",
  en: "Test Croissant",
  category: "เบเกอรี่",
  price: 45,
  sweet: false,
  unit: "piece",
  soldOut: false,
};
const config = {
  ...original,
  categories: [...new Set([...original.categories, "เบเกอรี่"])],
  products: [...original.products, product],
};
const payload = {
  type: "takeaway",
  table: null,
  items: [{ productId: product.id, variant: "regular", qty: 2, price: 1 }],
  idem: crypto.randomUUID(),
};
try {
  assert.equal((await admin("config", { config })).status, 200);
  const order = await guest("order", payload);
  assert.equal(order.status, 200);
  assert.equal(order.order.total, 90);
  assert.equal(order.order.items[0].sweet, null);
  assert.equal(order.order.items[0].unit, "piece");
  assert.equal(order.order.items[0].variantLabel, "ปกติ");
  for (const price of [-1, 2.5]) {
    assert.equal(
      (
        await admin("config", {
          config: {
            ...config,
            products: config.products.map((p) =>
              p.id === product.id ? { ...p, price } : p,
            ),
          },
        })
      ).status,
      400,
    );
  }
  const sold = {
    ...config,
    products: config.products.map((p) =>
      p.id === product.id ? { ...p, soldOut: true } : p,
    ),
  };
  assert.equal((await admin("config", { config: sold })).status, 200);
  assert.equal(
    (await guest("menu")).config.products.find((p) => p.id === product.id)
      .soldOut,
    true,
  );
  const denied = await guest("order", {
    ...payload,
    idem: crypto.randomUUID(),
  });
  assert.equal(denied.status, 400);
  assert.match(denied.error, /สินค้าหมดชั่วคราว/);
  assert.equal((await guest("order", payload)).order.id, order.order.id);
  assert.equal((await admin("config", { config })).status, 200);
  assert.equal(
    (await guest("order", { ...payload, idem: crypto.randomUUID() })).status,
    200,
  );
  console.log(
    "PASS: Regular bakery price, server totals, piece unit, no drink/sweetness requirement, invalid prices, visible sold-out item, blocked stale carts, stock restoration, idempotent old order.",
  );
} finally {
  assert.equal((await admin("config", { config: original })).status, 200);
}
