import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Exercise the actual route against an isolated DB; no live orders or printers.
const sqlite = new DatabaseSync(":memory:");
for (const file of fs
  .readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sqlite.exec(fs.readFileSync(path.join("drizzle", file), "utf8"));
let orderReads = 0;
globalThis.__receiptEnv = {
  DB: {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          if (sql.includes("FROM orders")) orderReads++;
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
  },
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "old-school-receipt-"));
try {
  fs.writeFileSync(
    path.join(temp, "env.mjs"),
    "export const env=globalThis.__receiptEnv;",
  );
  await build({
    entryPoints: { route: "app/api/pos/route.ts", receipt: "lib/receipt.ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "cloudflare:workers": path.join(temp, "env.mjs") },
    outdir: temp,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });
  const { GET } = await import(pathToFileURL(path.join(temp, "route.mjs")));
  const { buildReceipt } = await import(
    pathToFileURL(path.join(temp, "receipt.mjs"))
  );
  for (const [id, role, active] of [
    ["admin", "admin", 1],
    ["staff", "staff", 1],
    ["other", "customer", 1],
    ["disabled", "staff", 0],
    ["expired", "staff", 1],
  ]) {
    sqlite
      .prepare(
        "INSERT INTO users(id,name,role,salt,hash,active) VALUES(?,?,?,?,?,?)",
      )
      .run(id, id, role, "unused", "unused", active);
    sqlite
      .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
      .run(
        id + "-session",
        id,
        Date.now() + (id === "expired" ? -1000 : 1000000),
      );
  }
  sqlite.prepare("INSERT INTO config(key,value) VALUES('shop',?)").run(
    JSON.stringify({
      name: "OLD SCHOOL",
      subtitle: "Coffee & Good Days",
      bankQr: "private-shop-data",
      products: [{ id: "old-coffee", name: "New menu name", cold: 999 }],
    }),
  );
  const line = {
    productId: "old-coffee",
    name: "กาแฟชื่อเดิม",
    variant: "cold",
    variantLabel: "เย็น",
    sweet: 50,
    qty: 2,
    price: 50,
    note: "ไม่ใส่น้ำแข็ง",
    unit: "cup",
    category: "กาแฟ",
  };
  function insert(id, overrides = {}, payloadOverrides = {}) {
    const payload = {
      items: [line],
      type: "dinein",
      table: 8,
      method: "cash",
      subtotal: 100,
      adjustment: -10,
      adjustmentReason: "private-discount-reason",
      createdBy: "private-staff-name",
      ...payloadOverrides,
    };
    const order = {
      id,
      token: "private-token-" + id,
      owner: "private-owner",
      idem: "private-idem-" + id,
      payload: JSON.stringify(payload),
      total: 90,
      payment: "paid",
      version: 4,
      created: "2026-10-25T20:30:00.000Z",
      ...overrides,
    };
    sqlite
      .prepare(
        "INSERT INTO orders(id,token,owner,idem,payload,total,payment,version,created) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        order.id,
        order.token,
        order.owner,
        order.idem,
        order.payload,
        order.total,
        order.payment,
        order.version,
        order.created,
      );
    return { ...order, ...payload };
  }
  const snapshot = insert(1);
  insert(2, { payment: "unpaid" });
  insert(
    3,
    { total: 70 },
    {
      adjustment: -30,
      revisions: [
        {
          actorId: "private-actor-id",
          actor: "private-actor-name",
          reason: "private-refund-reason",
          before: { total: 100 },
          after: { total: 70 },
          settlement: { method: "qr", amount: -30 },
        },
      ],
    },
  );
  insert(
    4,
    { total: 110 },
    { adjustment: 10, type: "takeaway", table: null, method: "qr" },
  );
  insert(5, { total: 90 }, { method: "counter" });
  insert(6, { total: 0 }, { adjustment: -100 });
  insert(7, { total: 90 }, { adjustment: 0 }); // Corrupt stored total must not produce a plausible receipt.
  insert(
    8,
    { total: 120 },
    {
      adjustment: 20,
      revisions: [{ settlement: { method: "qr", amount: 20 } }],
    },
  );
  const changesBefore = sqlite.prepare("SELECT total_changes() AS n").get().n;
  async function request(id, session = "staff") {
    const response = await GET(
      new Request(
        "http://localhost/api/pos?action=receipt&id=" + encodeURIComponent(id),
        {
          headers: {
            cookie: session
              ? "os_session=" + session + "-session"
              : "os_guest=guest",
          },
        },
      ),
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, ...(await response.json()) };
  }
  for (const session of ["", "missing", "disabled", "expired"])
    assert.equal((await request(1, session)).status, 401);
  assert.equal((await request(1, "other")).status, 403);
  assert.equal(
    orderReads,
    0,
    "authenticate and authorize before looking up an order",
  );
  for (const id of [
    "",
    "0",
    "-1",
    "1.2",
    "1e0",
    " 1",
    "Infinity",
    "9007199254740993",
  ])
    assert.equal((await request(id)).status, 400);
  assert.equal(orderReads, 0, "invalid IDs must not query orders");
  assert.equal((await request(999)).status, 404);
  assert.equal((await request(2)).status, 409);
  assert.throws(
    () => buildReceipt({ ...snapshot, payment: "unpaid" }, {}),
    /ชำระเงิน/,
  );
  const staffReceipt = await request(1);
  assert.equal(staffReceipt.status, 200);
  const adminReceipt = await request(1, "admin");
  assert.equal(adminReceipt.status, 200);
  assert.deepEqual(staffReceipt.receipt, adminReceipt.receipt);
  assert.deepEqual(staffReceipt.receipt, {
    number: "OS-0001",
    version: 4,
    created: "2026-10-25T20:30:00.000Z",
    type: "dinein",
    table: 8,
    shop: { name: "OLD SCHOOL", subtitle: "Coffee & Good Days" },
    items: [
      {
        name: "กาแฟชื่อเดิม",
        variantLabel: "เย็น",
        sweet: 50,
        qty: 2,
        price: 50,
        note: "ไม่ใส่น้ำแข็ง",
        unit: "cup",
        lineTotal: 100,
      },
    ],
    subtotal: 100,
    adjustment: -10,
    total: 90,
    payments: { cash: 90, qr: 0, unknown: 0 },
    hasSettlements: false,
  });
  const refund = (await request(3)).receipt;
  assert.deepEqual(refund.payments, { cash: 100, qr: -30, unknown: 0 });
  assert.equal(refund.hasSettlements, true);
  assert.equal(refund.total, 70);
  const extra = (await request(4)).receipt;
  assert.equal(extra.type, "takeaway");
  assert.equal(extra.table, null);
  assert.equal(extra.adjustment, 10);
  assert.deepEqual(extra.payments, { cash: 0, qr: 110, unknown: 0 });
  assert.deepEqual((await request(5)).receipt.payments, {
    cash: 0,
    qr: 0,
    unknown: 90,
  });
  assert.equal((await request(6)).receipt.total, 0);
  assert.equal((await request(7)).status, 409);
  const collected = (await request(8)).receipt;
  assert.deepEqual(collected.payments, { cash: 100, qr: 20, unknown: 0 });
  assert.equal(collected.hasSettlements, true);
  for (const receipt of [staffReceipt.receipt, refund, extra]) {
    const serialized = JSON.stringify(receipt);
    assert(
      !serialized.includes("private-"),
      "private values must stay outside the receipt DTO",
    );
    for (const key of [
      "owner",
      "token",
      "idem",
      "createdBy",
      "revisions",
      "adjustmentReason",
      "paidAt",
    ])
      assert(!Object.hasOwn(receipt, key), key + " is not part of a receipt");
  }
  assert.equal(
    sqlite.prepare("SELECT total_changes() AS n").get().n,
    changesBefore,
    "receipt requests must not modify orders, payments, audit logs, or other tables",
  );
  console.log(
    "Receipt API: authorization, paid-only access, stored prices, discounts, refunds, privacy, and read-only checks passed.",
  );
} finally {
  delete globalThis.__receiptEnv;
  sqlite.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
