import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const base = process.env.POS_TEST_URL || "http://localhost:5173";
const keys = Object.fromEntries(
  fs
    .readFileSync(".dev.vars", "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
function client() {
  let jar = "";
  return async function (action, data) {
    const r = await fetch(
      base + "/api/pos" + (data ? "" : "?action=" + action),
      {
        method: data ? "POST" : "GET",
        headers: {
          ...(data ? { "Content-Type": "application/json", Origin: base } : {}),
          Cookie: jar,
        },
        ...(data ? { body: JSON.stringify({ action, ...data }) } : {}),
      },
    );
    const c = r.headers.get("set-cookie");
    if (c) {
      const key = c.split(";")[0].split("=")[0];
      jar = jar
        .split("; ")
        .filter((x) => !x.startsWith(key + "="))
        .concat(c.split(";")[0])
        .filter(Boolean)
        .join("; ");
    }
    return { status: r.status, ...(await r.json()) };
  };
}
const guest = client(),
  other = client(),
  staff = client(),
  admin = client();
const menu = await guest("menu");
assert.equal(menu.config.products.length, 42);
assert.equal(menu.config.products.find((p) => p.id === "mocha").cold, 60);
assert.equal((await guest("orders")).status, 401);
assert.equal((await guest("admin")).status, 403);
const setup = await admin("setup");
const password = crypto.randomBytes(18).toString("base64url");
if (setup.needed) {
  assert.equal(
    (await admin("setup", { secret: "wrong", password })).status,
    403,
  );
  assert.equal(
    (await admin("setup", { secret: keys.POS_SETUP_KEY, password })).status,
    200,
  );
  fs.writeFileSync(".test-password", password);
}
const pw = fs.readFileSync(".test-password", "utf8");
assert.equal(
  (await admin("login", { username: "owner", password: pw })).status,
  200,
);
const staffId = "test_" + crypto.randomBytes(4).toString("hex");
assert.equal(
  (
    await admin("user", {
      id: staffId,
      name: "Test staff",
      password,
      role: "staff",
    })
  ).status,
  200,
);
assert.equal(
  (await staff("login", { username: staffId, password })).status,
  200,
);
assert.equal((await staff("config", { config: menu.config })).status, 403);
const idem = crypto.randomUUID();
const payload = {
  idem,
  type: "dinein",
  table: 3,
  method: "cash",
  items: [
    {
      productId: "mocha",
      variant: "cold",
      sweet: 50,
      qty: 2,
      price: 1,
      note: "ทดสอบระบบ",
    },
  ],
};
const results = await Promise.all([
  guest("order", payload),
  guest("order", payload),
]);
assert.equal(results[0].order.id, results[1].order.id);
assert.equal(results[0].order.total, 120);
let order = results[0].order;
await other("menu");
assert.equal((await other("mine")).orders.length, 0);
assert.equal(
  (await guest("order", { ...payload, idem: crypto.randomUUID(), table: 999 }))
    .status,
  400,
);
assert.equal(
  (
    await guest("order", {
      ...payload,
      idem: crypto.randomUUID(),
      items: [{ ...payload.items[0], variant: "blend" }],
    })
  ).status,
  400,
);
assert.equal(
  (await staff("status", { id: order.id, version: 0, status: "ready" })).status,
  409,
);
assert.equal(
  (await staff("status", { id: order.id, version: 0, status: "making" }))
    .status,
  200,
);
assert.equal(
  (await staff("status", { id: order.id, version: 0, status: "making" }))
    .status,
  409,
);
assert.equal(
  (await staff("status", { id: order.id, version: 1, status: "ready" })).status,
  200,
);
assert.equal((await guest("mine")).orders[0].status, "ready");
assert.equal(
  (await staff("status", { id: order.id, version: 2, status: "done" })).status,
  409,
);
assert.equal(
  (await staff("payment", { id: order.id, version: 2 })).status,
  200,
);
assert.equal(
  (await staff("status", { id: order.id, version: 3, status: "done" })).status,
  200,
);
order = (await guest("mine")).orders[0];
assert.equal(order.status, "done");
assert.equal(order.payment, "paid");
await admin("disable-user", { id: staffId, active: false });
assert.equal((await staff("orders")).status, 401);
console.log(
  "PASS: 42 menus; Mocha prices; server pricing; concurrent idempotency; guest isolation; roles; invalid options/tables; status transitions; stale writes; payment before completion; disabled sessions.",
);
