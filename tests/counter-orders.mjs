import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const base = "http://localhost:5173";
function client() {
  let jar = "";
  return async (action, data) => {
    const r = await fetch(
      base + "/api/pos" + (data ? "" : "?action=" + action),
      {
        method: data ? "POST" : "GET",
        headers: {
          Cookie: jar,
          ...(data ? { "Content-Type": "application/json", Origin: base } : {}),
        },
        ...(data ? { body: JSON.stringify({ action, ...data }) } : {}),
      },
    );
    const cookie = r.headers.get("set-cookie");
    if (cookie) {
      const part = cookie.split(";")[0],
        key = part.split("=")[0];
      jar = jar
        .split("; ")
        .filter((x) => x && !x.startsWith(key + "="))
        .concat(part)
        .join("; ");
    }
    return { status: r.status, ...(await r.json()) };
  };
}
const admin = client(),
  staff = client(),
  guest = client(),
  other = client();
assert.equal(
  (
    await admin("login", {
      username: "owner",
      password: fs.readFileSync(".test-password", "utf8"),
    })
  ).status,
  200,
);
const baseline = (await admin("admin")).config;
const staffId = "counter_" + crypto.randomBytes(4).toString("hex"),
  password = crypto.randomBytes(16).toString("hex");
assert.equal(
  (
    await admin("user", {
      id: staffId,
      name: "Counter test",
      role: "staff",
      password,
    })
  ).status,
  200,
);
await staff("login", { username: staffId, password });
const line = {
  productId: "mocha",
  variant: "cold",
  sweet: 50,
  qty: 2,
  price: 1,
  note: "ทดสอบหน้าร้าน",
};
const draft = {
  idem: crypto.randomUUID(),
  type: "dinein",
  table: 2,
  items: [line],
  adjustment: 0,
};
try {
  assert.equal((await guest("counter-order", draft)).status, 401);
  const created = await Promise.all([
    staff("counter-order", draft),
    staff("counter-order", draft),
  ]);
  assert.equal(created[0].status, 200);
  assert.equal(created[0].order.id, created[1].order.id);
  let o = created[0].order;
  assert.equal(o.total, 120);
  assert.equal(o.source, "counter");
  await guest("menu");
  await other("menu");
  assert(!(await guest("mine")).orders.some((x) => x.id === o.id));
  let edit = {
    id: o.id,
    version: o.version,
    type: "takeaway",
    items: [{ ...line, originalIndex: 0, qty: 1 }],
    adjustment: -5,
    reason: "ส่วนลดหน้าร้าน",
  };
  assert.equal((await guest("edit-order", edit)).status, 401);
  assert.equal((await staff("edit-order", edit)).status, 403);
  assert.equal(
    (await admin("edit-order", { ...edit, reason: "" })).status,
    400,
  );
  assert.equal(
    (await admin("edit-order", { ...edit, adjustment: -999 })).status,
    400,
  );
  let res = await admin("edit-order", edit);
  assert.equal(res.status, 200);
  o = res.order;
  assert.equal(o.total, 55);
  assert.equal(o.table, null);
  assert.equal(o.revisions.length, 1);
  assert.equal(o.revisions[0].before.total, 120);
  assert.equal((await admin("edit-order", edit)).status, 409);
  // Menu price changes must not reprice an already ordered item; new options use current catalog.
  const changed = structuredClone(baseline);
  changed.products.find((p) => p.id === "mocha").cold = 75;
  await admin("config", { config: changed });
  res = await admin("edit-order", {
    ...edit,
    version: o.version,
    items: [{ ...line, originalIndex: 0, qty: 1, price: 1 }],
    reason: "แก้หมายเหตุ",
  });
  assert.equal(res.status, 200);
  o = res.order;
  assert.equal(o.total, 55);
  assert.equal(o.items[0].price, 60);
  res = await admin("edit-order", {
    ...edit,
    version: o.version,
    items: [{ ...line, originalIndex: 0, variant: "hot", qty: 1 }],
    reason: "เปลี่ยนเป็นร้อน",
  });
  assert.equal(res.status, 200);
  o = res.order;
  assert.equal(o.total, 50);
  assert.equal(o.items[0].price, 55);
  assert.equal(
    (await staff("payment", { id: o.id, version: o.version, method: "cash" }))
      .status,
    200,
  );
  o = (await admin("orders")).orders.find((x) => x.id === o.id);
  edit = {
    id: o.id,
    version: o.version,
    type: "takeaway",
    items: [{ ...o.items[0], originalIndex: 0 }],
    adjustment: -10,
    reason: "คืนส่วนลด",
  };
  assert.equal((await staff("edit-order", edit)).status, 403);
  assert.equal((await admin("edit-order", edit)).status, 400);
  res = await admin("edit-order", { ...edit, settlementMethod: "cash" });
  assert.equal(res.status, 200);
  o = res.order;
  assert.equal(o.total, 45);
  assert.equal(o.payment, "paid");
  assert.equal(o.revisions.at(-1).settlement.amount, -5);
  // Concurrent correction attempts can record only one receipt/refund.
  edit = {
    ...edit,
    version: o.version,
    adjustment: 0,
    settlementMethod: "qr",
    reason: "รับเพิ่มตามราคาเต็ม",
  };
  const edits = await Promise.all([
    admin("edit-order", edit),
    admin("edit-order", edit),
  ]);
  assert.deepEqual(edits.map((x) => x.status).sort(), [200, 409]);
  o = edits.find((x) => x.status === 200).order;
  assert.equal(o.total, 55);
  assert.equal(o.revisions.at(-1).settlement.amount, 10);
  // Guest-owned order remains visible only to its owner after staff edits.
  const qr = await guest("order", { ...draft, idem: crypto.randomUUID() });
  let q = qr.order;
  res = await staff("edit-order", {
    id: q.id,
    version: q.version,
    type: "dinein",
    table: 3,
    items: [{ ...q.items[0], originalIndex: 0, qty: 1 }],
    reason: "ลูกค้าลดจำนวน",
  });
  assert.equal(res.status, 200);
  assert.equal(
    (await guest("mine")).orders.find((x) => x.id === q.id).total,
    75,
  );
  assert(!(await other("mine")).orders.some((x) => x.id === q.id));
  assert.equal(
    (
      await admin("edit-order", {
        id: q.id,
        version: res.order.version,
        type: "dinein",
        table: 3,
        items: [
          { ...q.items[0], originalIndex: 0 },
          { ...q.items[0], originalIndex: 0 },
        ],
        reason: "duplicate",
      })
    ).status,
    400,
  );
  console.log(
    "PASS: counter order idempotency; server prices; edit history; discounts; paid corrections/refunds; roles; concurrent stale protection; original prices; guest ownership.",
  );
} finally {
  await admin("config", { config: baseline });
  await admin("disable-user", { id: staffId, active: false });
}
