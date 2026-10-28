import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Exercise the actual SQL and all saved migrations against a year's history at
// 100 separate orders/day. This checks query plans and results, not Workers CPU
// limits or Cloudflare's production rows_read accounting.
const db = new DatabaseSync(":memory:");
for (const file of readdirSync("drizzle")
  .filter((x) => x.endsWith(".sql"))
  .sort())
  db.exec(readFileSync(`drizzle/${file}`, "utf8"));

function sourceQueries(file) {
  return [
    ...readFileSync(file, "utf8").matchAll(
      /\.prepare\(\s*("(?:[^"\\]|\\.)*")/g,
    ),
  ].map((match) => JSON.parse(match[1]));
}
function query(file, prefix) {
  const sql = sourceQueries(file).find((text) => text.startsWith(prefix));
  assert(sql, `Missing production query: ${file}: ${prefix}`);
  return sql;
}
const staffSql = query("app/api/pos/route.ts", "SELECT * FROM orders ORDER BY");
const mineSql = query(
  "app/api/pos/route.ts",
  "SELECT * FROM orders WHERE owner=",
);
const reportSql = query(
  "lib/report-server.ts",
  "SELECT * FROM orders WHERE created>=",
);
const queueSql = query(
  "lib/push.ts",
  "SELECT id FROM push_events WHERE status=",
);
const loginSql = query(
  "app/api/pos/route.ts",
  "SELECT COUNT(*) as n FROM audit WHERE",
);
const orderLogsSql = query(
  "app/api/pos/route.ts",
  "SELECT id,kind,status,created,message FROM push_events WHERE",
);
const deliveryLogsSql = query(
  "app/api/pos/route.ts",
  "SELECT event_id,status,http_status,error,created FROM push_deliveries WHERE",
);
const plan = (sql, ...bindings) =>
  db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...bindings)
    .map((row) => row.detail)
    .join("; ");
function usesIndex(sql, bindings, index) {
  const details = plan(sql, ...bindings);
  assert(details.includes(index), `Expected ${index}, got ${details}`);
  assert(
    !/SCAN (orders|push_events|push_deliveries|audit)\b/.test(details),
    details,
  );
  return details;
}

const ordersPerDay = 100,
  days = 365,
  count = days * ordersPerDay;
const start = Date.parse("2025-01-01T00:00:00.000Z");
const orderInsert = db.prepare(
  "INSERT INTO orders(token,owner,idem,payload,total,status,payment,created) VALUES(?,?,?,?,?,?,?,?)",
);
const eventInsert = db.prepare(
  "INSERT INTO push_events(id,order_id,kind,status,created) VALUES(?,?,?,?,?)",
);
const deliveryInsert = db.prepare(
  "INSERT INTO push_deliveries(id,event_id,order_id,device,status,created) VALUES(?,?,?,?,?,?)",
);
const auditInsert = db.prepare(
  "INSERT INTO audit(actor,action,target,created) VALUES(?,?,?,?)",
);
const payload = JSON.stringify({
  items: [{ productId: "coffee", qty: 1, price: 60 }],
  type: "takeaway",
});
db.exec("BEGIN");
for (let i = 0; i < count; i++) {
  const id = i + 1;
  const day = Math.floor(i / ordersPerDay);
  const instant = start + day * 86400000 + (i % ordersPerDay) * 60000;
  // One long-standing customer has more than 20 scattered orders, while the
  // last new visitor has none. Both cases used to scan older unrelated orders.
  const owner = i % 500 === 0 ? "returning-customer" : `guest-${id}`;
  orderInsert.run(
    `token-${id}`,
    owner,
    `idem-${id}`,
    payload,
    60,
    "done",
    "paid",
    new Date(instant).toISOString(),
  );
  for (const kind of ["staff_new", "automatic"]) {
    const event = `${kind}-${id}`;
    eventInsert.run(event, id, kind, "sent", instant);
    deliveryInsert.run(
      `delivery-${event}`,
      event,
      id,
      `device-${id}`,
      "sent",
      instant,
    );
  }
  auditInsert.run(
    "staff",
    "payment",
    String(id),
    new Date(instant).toISOString(),
  );
}
// Queued items deliberately follow a year of terminal events.
eventInsert.run(
  "queued-newer",
  count,
  "manual",
  "queued",
  start + 366 * 86400000,
);
eventInsert.run(
  "queued-older",
  count,
  "manual",
  "queued",
  start + 365 * 86400000,
);
eventInsert.run(
  "queued-latest",
  count,
  "manual",
  "queued",
  start + 367 * 86400000,
);
const loginSince = "2026-01-01T00:00:00.000Z";
for (let i = 0; i < 10; i++)
  auditInsert.run(
    "anonymous",
    "login_failed",
    "owner",
    `2026-01-01T00:01:${String(i).padStart(2, "0")}.000Z`,
  );
db.exec("COMMIT");

const mine = db.prepare(mineSql).all("returning-customer");
assert.equal(mine.length, 20);
assert(mine.every((row) => row.owner === "returning-customer"));
assert(mine.every((row, i) => i === 0 || row.id < mine[i - 1].id));
assert.deepEqual(db.prepare(mineSql).all("new-visitor"), []);
usesIndex(mineSql, ["returning-customer"], "orders_owner_id_idx");
usesIndex(mineSql, ["new-visitor"], "orders_owner_id_idx");

const staff = db.prepare(staffSql).all();
assert.equal(staff.length, 500);
assert.equal(staff[0].id, count);
assert.equal(staff.at(-1).id, count - 499);

const range = ["2025-12-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"];
const report = db.prepare(reportSql).all(...range);
assert.equal(report.length, 31 * ordersPerDay);
assert.equal(
  report.reduce((sum, row) => sum + row.total, 0),
  31 * ordersPerDay * 60,
);
assert(report.every((row, i) => i === 0 || row.id < report[i - 1].id));
usesIndex(reportSql, range, "orders_created_idx");

const queued = db.prepare(queueSql).all();
assert.deepEqual(
  queued.map((row) => row.id),
  ["queued-older", "queued-newer"],
);
usesIndex(queueSql, [], "push_events_status_created_idx");
const queuePlan = plan(queueSql);
assert(!queuePlan.includes("TEMP B-TREE"), queuePlan);
usesIndex(loginSql, ["owner", loginSince], "audit_login_attempt_idx");
assert.equal(db.prepare(loginSql).get("owner", loginSince).n, 10);
usesIndex(orderLogsSql, [count], "push_events_order_created_idx");
usesIndex(deliveryLogsSql, [count], "push_deliveries_order_created_idx");

// Compare unchanged result semantics after removing only the new indexes.
// This also makes the test fail if its fixture no longer exposes the old scans.
const indexedIndexes = db
  .prepare(
    "SELECT name,sql FROM sqlite_master WHERE type='index' AND name IN('orders_owner_id_idx','orders_created_idx','push_events_status_created_idx','audit_login_attempt_idx')",
  )
  .all();
for (const index of indexedIndexes) db.exec(`DROP INDEX ${index.name}`);
assert(plan(mineSql, "new-visitor").includes("SCAN orders"));
assert(plan(queueSql).includes("SCAN push_events"));
assert.deepEqual(db.prepare(mineSql).all("returning-customer"), mine);
assert.deepEqual(db.prepare(reportSql).all(...range), report);
assert.deepEqual(db.prepare(queueSql).all(), queued);
for (const index of indexedIndexes) db.exec(index.sql);

console.log(
  JSON.stringify(
    {
      result: "PASS",
      scenario: "100 separate orders/day for 365 days",
      orders: count,
      pushEvents: count * 2 + 3,
      staffSnapshot: staff.length,
      customerSnapshot: mine.length,
      monthlyReport: report.length,
      checks:
        "Production SQL; all migrations; indexed owner/date/queue/login/log lookups; bounded500/20 snapshots; unchanged results without indexes",
      limitation:
        "SQLite query-plan regression only; not a measured D1 quota or Workers CPU guarantee",
    },
    null,
    2,
  ),
);
db.close();
