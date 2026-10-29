import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const sqlite = new DatabaseSync(":memory:");
const temp = mkdtempSync(join(tmpdir(), "oldschool-delete-order-"));
const oldEnv = globalThis.__deleteOrderEnv;
let beforeBatch = null;
let failSql = null;
let batchQueue = Promise.resolve();
const DB = {
  prepare(sql) {
    let values = [];
    const statement = sqlite.prepare(sql);
    return {
      bind(...bindings) {
        values = bindings;
        return this;
      },
      async first() {
        return statement.get(...values) ?? null;
      },
      async all() {
        return { results: statement.all(...values) };
      },
      async run() {
        if (failSql && sql.includes(failSql))
          throw new Error("simulated batch failure");
        const result = statement.run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    };
  },
  async batch(statements) {
    let release;
    const previous = batchQueue;
    batchQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (beforeBatch) {
        const action = beforeBatch;
        beforeBatch = null;
        action();
      }
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    } finally {
      release();
    }
  },
};
const admin = "os_session=delete-admin";
const staff = "os_session=delete-staff";
const count = (table, where = "", value) =>
  sqlite
    .prepare(
      `SELECT count(*) AS n FROM ${table}${where ? " WHERE " + where : ""}`,
    )
    .get(...(value === undefined ? [] : [value])).n;
const snapshot = (table) =>
  JSON.stringify(sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
try {
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    );
  for (const role of ["admin", "staff"]) {
    sqlite
      .prepare("INSERT INTO users(id,name,role,salt,hash) VALUES(?,?,?,?,?)")
      .run(role, role, role, "unused", "unused");
    sqlite
      .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
      .run("delete-" + role, role, Date.now() + 3_600_000);
  }
  const config = {
    name: "QA",
    tables: 1,
    accepting: true,
    products: [
      {
        id: "coffee",
        name: "Coffee",
        en: "Coffee",
        category: "กาแฟ",
        cold: 50,
        sweet: true,
      },
    ],
  };
  sqlite
    .prepare("INSERT INTO config VALUES (?,?)")
    .run("shop", JSON.stringify(config));
  sqlite
    .prepare("INSERT INTO config VALUES (?,?)")
    .run("order_queue_offset", "0");
  sqlite
    .prepare("INSERT INTO audit(actor,action,target,created) VALUES(?,?,?,?)")
    .run("admin", "payment", "1", new Date().toISOString());
  sqlite
    .prepare("INSERT INTO uploaded_images VALUES(?,?,?,?,?)")
    .run(
      "kept-image",
      "image/jpeg",
      Uint8Array.from([255, 216, 255]),
      3,
      Date.now(),
    );
  sqlite
    .prepare(
      "INSERT INTO staff_push_devices(id,user_id,session_id,value,created,device_key) VALUES(?,?,?,?,?,?)",
    )
    .run(
      "staff-device",
      "staff",
      "delete-staff",
      "{}",
      Date.now(),
      "device-key",
    );
  const seedOrder = (total, payment = "unpaid", number) => {
    const token = crypto.randomUUID();
    const idem = crypto.randomUUID();
    const payload = {
      items: [
        {
          productId: "coffee",
          name: "Coffee",
          category: "กาแฟ",
          unit: "cup",
          variant: "cold",
          variantLabel: "เย็น",
          sweet: 100,
          qty: 1,
          price: total,
          note: "",
        },
      ],
      type: "takeaway",
      table: null,
      method: "cash",
      source: "counter",
      queueNumber: number,
    };
    const result = sqlite
      .prepare(
        "INSERT INTO orders(token,owner,idem,payload,total,status,payment,created) VALUES(?,?,?,?,?,'waiting',?,?)",
      )
      .run(
        token,
        "counter:admin",
        idem,
        JSON.stringify(payload),
        total,
        payment,
        new Date().toISOString(),
      );
    const id = Number(result.lastInsertRowid);
    return {
      id,
      token,
      idem,
      number: "OS-" + String(number ?? id).padStart(4, "0"),
      version: 0,
    };
  };
  const target = seedOrder(100, "paid", 300);
  const other = seedOrder(60, "paid", 301);
  const unpaid = seedOrder(40, "unpaid", 302);
  for (const id of ["unique", "shared", "other", "unrelated-orphan"])
    sqlite
      .prepare("INSERT INTO subscriptions VALUES(?,?,?)")
      .run(id, "guest", "{}");
  for (const [id, order, subscription] of [
    ["target-unique", target, "unique"],
    ["target-shared", target, "shared"],
    ["other-shared", other, "shared"],
    ["other-only", other, "other"],
  ])
    sqlite
      .prepare("INSERT INTO push_order_devices VALUES(?,?,?,?)")
      .run(id, order.id, subscription, Date.now());
  for (const [id, order] of [
    ["event-target", target],
    ["event-target-2", target],
    ["event-other", other],
  ]) {
    sqlite
      .prepare(
        "INSERT INTO push_events(id,order_id,kind,created) VALUES(?,?,?,?)",
      )
      .run(id, order.id, "automatic", Date.now());
    sqlite
      .prepare(
        "INSERT INTO push_deliveries(id,event_id,order_id,device,status,created) VALUES(?,?,?,?,?,?)",
      )
      .run("delivery-" + id, id, order.id, id, "accepted", Date.now());
  }
  globalThis.__deleteOrderEnv = { DB };
  writeFileSync(
    join(temp, "env.mjs"),
    "export const env=globalThis.__deleteOrderEnv;\n",
  );
  await build({
    entryPoints: ["app/api/pos/route.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "cloudflare:workers": join(temp, "env.mjs") },
    outfile: join(temp, "route.mjs"),
    logLevel: "silent",
  });
  const { GET, POST } = await import(pathToFileURL(join(temp, "route.mjs")));
  const post = async (action, data, cookie = admin) => {
    const response = await POST(
      new Request("http://localhost/api/pos", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...data }),
      }),
    );
    return { status: response.status, ...(await response.json()) };
  };
  const get = async (action, cookie = admin) => {
    const response = await GET(
      new Request("http://localhost/api/pos?action=" + action, {
        headers: { Cookie: cookie },
      }),
    );
    return { status: response.status, ...(await response.json()) };
  };
  const deletion = (o) => ({
    id: o.id,
    version: o.version,
    confirmation: o.number,
  });
  const allBefore = snapshot("orders");
  assert.equal((await post("delete-order", deletion(target), "")).status, 401);
  assert.equal(
    (await post("delete-order", deletion(target), staff)).status,
    403,
  );
  for (const data of [
    { ...deletion(target), id: 0 },
    { ...deletion(target), id: "1" },
    { ...deletion(target), version: -1 },
    { ...deletion(target), version: "0" },
    { ...deletion(target), confirmation: "wrong" },
  ])
    assert.equal((await post("delete-order", data)).status, 400);
  assert.equal(
    (await post("delete-order", { ...deletion(target), version: 99 })).status,
    409,
  );
  assert.equal(snapshot("orders"), allBefore);
  assert.equal(
    (
      await post("delete-order", {
        id: 999,
        version: 0,
        confirmation: "OS-0999",
      })
    ).status,
    404,
  );
  const stable = Object.fromEntries(
    [
      "config",
      "users",
      "sessions",
      "staff_push_devices",
      "uploaded_images",
      "image_storage",
    ].map((table) => [table, snapshot(table)]),
  );
  const beforeReport = await get("report");
  assert.equal(beforeReport.summary.sales, 160);

  // A version update between preview and the atomic batch must preserve every child row.
  beforeBatch = () =>
    sqlite
      .prepare("UPDATE orders SET version=version+1 WHERE id=?")
      .run(target.id);
  const stale = await post("delete-order", deletion(target));
  assert.equal(stale.status, 409);
  for (const table of ["push_events", "push_deliveries", "push_order_devices"])
    assert.equal(count(table, "order_id=?", target.id), 2);
  assert.equal(count("audit", "action=?", "delete-order"), 0);
  assert.equal(count("audit", "action=?", "retired-order-idem"), 0);
  target.version = 1;

  // Failure anywhere in the batch rolls back the order and its audit record.
  failSql = "DELETE FROM push_events";
  assert.notEqual((await post("delete-order", deletion(target))).status, 200);
  assert.equal(count("orders", "id=?", target.id), 1);
  assert.equal(count("push_deliveries", "order_id=?", target.id), 2);
  assert.equal(count("audit", "action=?", "delete-order"), 0);
  assert.equal(count("audit", "action=?", "retired-order-idem"), 0);
  failSql = null;
  const result = await post("delete-order", deletion(target));
  assert.equal(result.status, 200);
  assert.equal(result.deleted, 1);
  assert.equal(result.number, target.number);
  assert.equal(count("orders", "id=?", target.id), 0);
  for (const table of [
    "push_events",
    "push_deliveries",
    "push_order_devices",
  ]) {
    assert.equal(count(table, "order_id=?", target.id), 0);
    assert.equal(
      count(table, "order_id=?", other.id),
      table === "push_order_devices" ? 2 : 1,
    );
  }
  assert.equal(count("subscriptions", "id=?", "unique"), 0);
  for (const id of ["shared", "other", "unrelated-orphan"])
    assert.equal(count("subscriptions", "id=?", id), 1);
  for (const [table, value] of Object.entries(stable))
    assert.equal(snapshot(table), value, table + " must be retained");
  assert.equal(count("audit", "action=?", "payment"), 1);
  const audit = sqlite
    .prepare("SELECT * FROM audit WHERE action='delete-order'")
    .get();
  assert.equal(audit.actor, "admin");
  assert.deepEqual(JSON.parse(audit.target), {
    id: target.id,
    number: target.number,
    total: 100,
    payment: "paid",
    status: "waiting",
  });
  assert.equal((await post("track", { token: target.token }, "")).status, 404);
  assert.equal((await post("delete-order", deletion(target))).status, 404);
  const createPayload = (idem) => ({
    idem,
    type: "takeaway",
    table: null,
    items: [{ productId: "coffee", variant: "cold", sweet: 100, qty: 1 }],
  });
  for (const action of ["order", "counter-order"])
    assert.equal(
      (
        await post(
          action,
          createPayload(target.idem),
          action === "order" ? "os_guest=retry-check" : admin,
        )
      ).status,
      410,
      "deleted idempotency keys cannot resurrect orders",
    );
  assert.equal(count("orders", "idem=?", target.idem), 0);
  assert.equal(count("audit", "action=?", "retired-order-idem"), 1);
  const afterReport = await get("report");
  assert.equal(afterReport.summary.sales, 60);
  assert.equal(afterReport.summary.paidOrders, 1);
  assert.equal(afterReport.summary.pending, 40);
  assert(!afterReport.orders.some((o) => o.id === target.id));

  // Concurrent confirmations cannot delete another order or produce duplicate deletion audits.
  const responses = await Promise.all([
    post("delete-order", deletion(unpaid)),
    post("delete-order", deletion(unpaid)),
  ]);
  assert.equal(responses.filter((r) => r.status === 200).length, 1);
  assert.equal(count("audit", "action=?", "delete-order"), 2);
  assert.equal(count("orders", "id=?", other.id), 1);
  const sequence = sqlite
    .prepare("SELECT seq FROM sqlite_sequence WHERE name='orders'")
    .get().seq;
  const created = await post("counter-order", {
    idem: crypto.randomUUID(),
    type: "takeaway",
    table: null,
    items: [{ productId: "coffee", variant: "cold", sweet: 100, qty: 1 }],
  });
  assert.equal(created.status, 200);
  assert(created.order.id > sequence, "deletion must not reuse internal IDs");
  assert.notEqual(
    created.order.number,
    "OS-0001",
    "deletion must not restart the queue",
  );
  const guestCreated = await post(
    "order",
    createPayload(crypto.randomUUID()),
    "os_guest=retry-check",
  );
  assert.equal(
    guestCreated.status,
    200,
    "a new guest nonce must still create an order",
  );
  assert(guestCreated.order.id > created.order.id);

  // Retiring a nonce after the precheck but before INSERT must still block both creation paths.
  for (const action of ["order", "counter-order"]) {
    const idem = crypto.randomUUID();
    beforeBatch = () =>
      sqlite
        .prepare(
          "INSERT INTO audit(actor,action,target,created) VALUES(?,?,?,?)",
        )
        .run("admin", "retired-order-idem", idem, new Date().toISOString());
    const raced = await post(
      action,
      createPayload(idem),
      action === "order" ? "os_guest=retry-check" : admin,
    );
    assert.equal(
      raced.status,
      410,
      "the atomic INSERT must recheck retirement",
    );
    assert.equal(count("orders", "idem=?", idem), 0);
    assert.equal(
      sqlite
        .prepare(
          "SELECT count(*) n FROM audit WHERE action='counter-order' AND target=?",
        )
        .get(idem).n,
      0,
      "rejected creates must not record a successful sale",
    );
  }
  console.log(
    "PASS: admin-only single-order deletion, validation, exact confirmation, atomic version conflict/rollback, scoped push/subscription cleanup, audit trail, paid report removal, tracking invalidation, repeat/concurrent delete protection, retired-nonce replay/race protection on both creation paths, and retained catalog/accounts/images/sequence",
  );
} finally {
  if (oldEnv === undefined) delete globalThis.__deleteOrderEnv;
  else globalThis.__deleteOrderEnv = oldEnv;
  sqlite.close();
  rmSync(temp, { recursive: true, force: true });
}
