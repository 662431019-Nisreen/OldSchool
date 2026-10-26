import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, createECDH, randomBytes } from "node:crypto";
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
    sqlite.exec("BEGIN");
    try {
      const rows = [];
      for (const stmt of statements) rows.push(await stmt.run());
      sqlite.exec("COMMIT");
      return rows;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
  jwk = pair.privateKey.export({ format: "jwk" }),
  pub = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
globalThis.__pushEnv = {
  DB,
  VAPID_PUBLIC_KEY: pub,
  VAPID_PRIVATE_KEY: jwk.d,
  VAPID_SUBJECT: "https://old-school-coffee.asdareen112001.chatgpt.site",
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "old-school-push-"));
fs.writeFileSync(
  path.join(temp, "env.mjs"),
  "export const env=globalThis.__pushEnv;",
);
await build({
  entryPoints: ["app/api/pos/route.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  alias: { "cloudflare:workers": path.join(temp, "env.mjs") },
  outfile: path.join(temp, "route.mjs"),
  logLevel: "silent",
});
const { GET, POST } = await import(pathToFileURL(path.join(temp, "route.mjs")));
const request = (action, data, cookie = "os_guest=guest-one") => {
  const req = new Request(
    "http://localhost/api/pos" + (data ? "" : "?action=" + action),
    {
      method: data ? "POST" : "GET",
      headers: {
        cookie,
        Origin: "http://localhost",
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify({ action, ...data }) } : {}),
    },
  );
  return (data ? POST(req) : GET(req)).then(async (r) => ({
    status: r.status,
    ...(await r.json()),
  }));
};
for (const role of ["admin", "staff"]) {
  sqlite
    .prepare("INSERT INTO users(id,name,role,salt,hash) VALUES(?,?,?,?,?)")
    .run(role, role, role, "unused", "unused");
  sqlite
    .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
    .run(role + "-session", role, Date.now() + 1000000);
}
const staff = "os_session=staff-session",
  admin = "os_session=admin-session";
let sent = [];
const originalFetch = globalThis.fetch;
let httpStatus = 201;
globalThis.fetch = async (url, opts) => {
  assert(/^https:\/\/(fcm.googleapis.com|web.push.apple.com)/.test(url));
  assert.equal(opts.redirect, "error");
  assert.equal(opts.headers["Content-Encoding"], "aes128gcm");
  assert(opts.body.byteLength > 100);
  sent.push(url);
  return new Response(null, { status: httpStatus });
};
function device(suffix) {
  const e = createECDH("prime256v1");
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/" + suffix,
    keys: {
      p256dh: e.generateKeys().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}
try {
  const config = await request("push-key");
  assert.equal(config.configured, true);
  assert(!JSON.stringify(config).includes(jwk.d));
  const payload = {
    idem: crypto.randomUUID(),
    type: "dinein",
    table: 1,
    items: [{ productId: "mocha", variant: "cold", sweet: 100, qty: 1 }],
  };
  let order = (await request("order", payload)).order;
  assert(order);
  const sub = device("one");
  assert.equal(
    (await request("subscribe", { subscription: sub, tokens: [order.id] }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("subscribe", {
        subscription: sub,
        tokens: [crypto.randomUUID()],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("subscribe", { subscription: sub, tokens: [order.token] }))
      .ok,
    true,
  );
  assert.equal(
    (
      await request(
        "subscribe",
        { subscription: sub, tokens: [order.token] },
        "os_guest=guest-two",
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("track", { token: String(order.id) }, "os_guest=guest-two"))
      .status,
    404,
  );
  assert.equal(
    (await request("mine", undefined, "os_guest=guest-two")).orders.length,
    0,
  );
  assert.equal(
    (await request("track", { token: order.token }, "os_guest=guest-two")).order
      .number,
    order.number,
  );
  assert.equal(
    (await request("status", { id: order.id, version: 0, status: "making" }))
      .status,
    401,
  );
  assert.equal(
    (
      await request(
        "status",
        { id: order.id, version: 0, status: "making" },
        staff,
      )
    ).status,
    200,
  );
  assert.equal(sent.length, 0);
  let ready = await request(
    "status",
    { id: order.id, version: 1, status: "ready" },
    staff,
  );
  assert.equal(ready.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(
    (
      await request(
        "status",
        { id: order.id, version: 1, status: "ready" },
        staff,
      )
    ).status,
    409,
  );
  assert.equal(sent.length, 1);
  // Re-registering a ready order enqueues a late event but per-order/device dedupe blocks a second automatic push.
  assert.equal(
    (await request("subscribe", { subscription: sub, tokens: [order.token] }))
      .ok,
    true,
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
  const push = await import(pathToFileURL(path.join(temp, "push.mjs")));
  await push.drainPendingPush();
  assert.equal(sent.length, 1);
  const calls = await Promise.all([
    request("call", { id: order.id }, staff),
    request("call", { id: order.id }, staff),
  ]);
  assert.deepEqual(calls.map((c) => c.status).sort(), [200, 409]);
  assert.equal(sent.length, 2);
  assert.equal((await request("push-logs&id=" + order.id)).status, 403);
  const logs = await request("push-logs&id=" + order.id, undefined, staff);
  assert(logs.deliveries.some((d) => d.status === "accepted"));
  assert(!JSON.stringify(logs).includes(sub.endpoint));
  // Register after ready: creates one event for the new device; another customer's device is untouched.
  const other = (
    await request(
      "order",
      { ...payload, idem: crypto.randomUUID() },
      "os_guest=guest-two",
    )
  ).order;
  const otherSub = device("other");
  await request(
    "subscribe",
    { subscription: otherSub, tokens: [other.token] },
    "os_guest=guest-two",
  );
  const lateSub = device("late");
  await request("subscribe", { subscription: lateSub, tokens: [order.token] });
  await push.drainPendingPush();
  assert.equal(sent.length, 3);
  assert(!sent.includes(otherSub.endpoint));
  // Failed and expired devices are logged; expired endpoints and bindings are removed.
  httpStatus = 410;
  await request(
    "status",
    { id: other.id, version: 0, status: "making" },
    staff,
  );
  await request("status", { id: other.id, version: 1, status: "ready" }, staff);
  assert.equal(
    sqlite
      .prepare("SELECT count(*) n FROM subscriptions WHERE id=?")
      .get(otherSub.endpoint).n,
    0,
  );
  assert.equal(
    sqlite
      .prepare("SELECT status FROM push_deliveries WHERE order_id=?")
      .get(other.id).status,
    "expired",
  );
  const failure = (
    await request("order", { ...payload, idem: crypto.randomUUID() })
  ).order;
  await request("subscribe", {
    subscription: device("fail"),
    tokens: [failure.token],
  });
  httpStatus = 403;
  await request(
    "status",
    { id: failure.id, version: 0, status: "making" },
    staff,
  );
  await request(
    "status",
    { id: failure.id, version: 1, status: "ready" },
    staff,
  );
  assert.equal(
    sqlite
      .prepare("SELECT error FROM push_deliveries WHERE order_id=?")
      .get(failure.id).error,
    "push_auth_rejected",
  );
  const count = sent.length;
  await push.drainPendingPush();
  assert.equal(sent.length, count);
  console.log(
    "PASS: real API handlers + isolated SQLite; per-order device ownership; queued atomic status; automatic dedupe; late registration; manual cooldown; expired cleanup; failures and sanitized logs; private tracking tokens. All push transport was mocked, not device delivery.",
  );
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
