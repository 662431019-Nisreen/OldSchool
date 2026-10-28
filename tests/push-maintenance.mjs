import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const sqlite = new DatabaseSync(":memory:");
for (const file of fs
  .readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sqlite.exec(fs.readFileSync("drizzle/" + file, "utf8"));
let failMaintenance = true;
let maintenanceAttempts = 0;
const DB = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...v) {
        values = v;
        return statement;
      },
      async run() {
        const r = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(r.changes) } };
      },
      async first() {
        return sqlite.prepare(sql).get(...values) || null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...values) };
      },
    };
    return statement;
  },
  async batch(statements) {
    maintenanceAttempts++;
    if (failMaintenance) {
      failMaintenance = false;
      throw new Error("temporary cleanup failure");
    }
    sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
let now = 1_800_000_000_000;
const old = now - 31 * 86_400_000;
for (const [id, status] of [
  [1, "ready"],
  [2, "done"],
])
  sqlite
    .prepare(
      "INSERT INTO orders(id,token,owner,idem,payload,total,status,created) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      "token-" + id,
      "guest",
      "idem-" + id,
      "{}",
      100,
      status,
      new Date(now).toISOString(),
    );
for (const [id, created, status] of [
  ["old-event", old, "accepted"],
  ["queued-event", now, "queued"],
])
  sqlite
    .prepare(
      "INSERT INTO push_events(id,order_id,kind,created,status) VALUES(?,1,'automatic',?,?)",
    )
    .run(id, created, status);
for (const [id, created] of [
  ["old-delivery", old],
  ["current-delivery", now],
])
  sqlite
    .prepare(
      "INSERT INTO push_deliveries(id,event_id,order_id,device,status,created) VALUES(?,'queued-event',1,'device','accepted',?)",
    )
    .run(id, created);
for (const [id, order, created] of [
  ["active", 1, now],
  ["done", 2, now],
  ["expired", 1, old],
]) {
  sqlite
    .prepare("INSERT INTO subscriptions(id,owner,value) VALUES(?,'guest','{}')")
    .run(id);
  sqlite
    .prepare(
      "INSERT INTO push_order_devices(id,order_id,subscription_id,created) VALUES(?,?,?,?)",
    )
    .run(id, order, id, created);
}
sqlite
  .prepare(
    "INSERT INTO subscriptions(id,owner,value) VALUES('orphan','guest','{}')",
  )
  .run();
for (const [id, active] of [
  ["staff", 1],
  ["disabled", 0],
])
  sqlite
    .prepare(
      "INSERT INTO users(id,name,role,salt,hash,active) VALUES(?,?,'staff','unused','unused',?)",
    )
    .run(id, id, active);
for (const [id, user, key] of [
  ["durable", "staff", "device-key"],
  ["legacy-expired", "staff", null],
  ["disabled-device", "disabled", "key"],
])
  sqlite
    .prepare(
      "INSERT INTO staff_push_devices(id,user_id,session_id,value,created,device_key) VALUES(?,?,'expired-session','{}',?,?)",
    )
    .run(id, user, now, key);

const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), "old-school-push-maintenance-"),
);
globalThis.__maintenanceEnv = { DB };
fs.writeFileSync(
  path.join(temp, "env.mjs"),
  "export const env=globalThis.__maintenanceEnv;",
);
await build({
  entryPoints: ["lib/push.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  alias: { "cloudflare:workers": path.join(temp, "env.mjs") },
  outfile: path.join(temp, "push.mjs"),
  logLevel: "silent",
});
const originalNow = Date.now;
const originalError = console.error;
const logged = [];
Date.now = () => now;
console.error = (...args) => logged.push(args);
const exists = (table, id) =>
  !!sqlite.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id);
try {
  const push = await import(pathToFileURL(path.join(temp, "push.mjs")));
  await push.drainPendingPush();
  assert.equal(maintenanceAttempts, 1);
  assert.equal(
    sqlite
      .prepare("SELECT status FROM push_events WHERE id='queued-event'")
      .get().status,
    "not_configured",
    "housekeeping failure does not block queued processing",
  );
  assert(exists("push_events", "old-event"));
  assert.deepEqual(logged, [["push_cleanup_failed"]]);
  now += 59_000;
  await push.drainPendingPush();
  assert.equal(
    maintenanceAttempts,
    1,
    "failed maintenance is not retried on every poll",
  );
  now += 2_000;
  await push.drainPendingPush();
  assert.equal(maintenanceAttempts, 2);
  assert(!exists("push_events", "old-event"));
  assert(!exists("push_deliveries", "old-delivery"));
  assert(exists("push_events", "queued-event"));
  assert(exists("push_deliveries", "current-delivery"));
  assert.deepEqual(
    sqlite
      .prepare("SELECT id FROM push_order_devices")
      .all()
      .map((r) => r.id),
    ["active"],
  );
  assert.deepEqual(
    sqlite
      .prepare("SELECT id FROM subscriptions")
      .all()
      .map((r) => r.id),
    ["active"],
  );
  assert.deepEqual(
    sqlite
      .prepare("SELECT id FROM staff_push_devices")
      .all()
      .map((r) => r.id),
    ["durable"],
  );
  now += 60_000;
  await push.drainPendingPush();
  assert.equal(
    maintenanceAttempts,
    2,
    "successful maintenance runs at most daily per isolate",
  );
  console.log(
    "PASS: push housekeeping failure preserves queue recovery; bounded retry, 30-day retention, completed-order bindings, orphan subscriptions, and staff authorization cleanup.",
  );
} finally {
  Date.now = originalNow;
  console.error = originalError;
  delete globalThis.__maintenanceEnv;
  sqlite.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
