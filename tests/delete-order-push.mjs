import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createECDH, generateKeyPairSync, randomBytes } from "node:crypto";
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

const barrier = () => {
  let reached, release;
  return {
    reached: new Promise((resolve) => {
      reached = resolve;
    }),
    resumed: new Promise((resolve) => {
      release = resolve;
    }),
    arrive: () => reached(),
    release: () => release(),
  };
};
let deliveryBarrier = null;
let registrationBarrier = null;
const DB = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...v) {
        values = v;
        return statement;
      },
      async run() {
        if (
          deliveryBarrier &&
          sql.includes("INSERT OR IGNORE INTO push_deliveries")
        ) {
          const pause = deliveryBarrier;
          deliveryBarrier = null;
          pause.arrive();
          await pause.resumed;
        }
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
      async first() {
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...values) };
      },
    };
    return statement;
  },
  async batch(statements) {
    if (registrationBarrier) {
      const pause = registrationBarrier;
      registrationBarrier = null;
      pause.arrive();
      await pause.resumed;
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
  },
};
const keyPair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = keyPair.privateKey.export({ format: "jwk" });
const keys = {
  publicKey: Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url"),
  privateKey: jwk.d,
  subject: "https://coffee.test",
};
const env = {
  DB,
  VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: keys.subject,
};
globalThis.__deleteOrderPushEnv = env;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "old-school-delete-push-"));
fs.writeFileSync(
  path.join(temp, "env.mjs"),
  "export const env=globalThis.__deleteOrderPushEnv;\n",
);
const subscriptions = (suffix) => {
  const ecdh = createECDH("prime256v1");
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/" + suffix,
    keys: {
      p256dh: ecdh.generateKeys().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
};
const device = subscriptions("shared-order-device");
sqlite
  .prepare("INSERT INTO subscriptions(id,owner,value) VALUES(?,'guest',?)")
  .run(device.endpoint, JSON.stringify(device));
sqlite
  .prepare(
    "INSERT INTO users(id,name,role,salt,hash) VALUES('staff','Staff','staff','unused','unused')",
  )
  .run();
const staffDevice = subscriptions("staff-device");
sqlite
  .prepare(
    "INSERT INTO staff_push_devices(id,user_id,session_id,value,created,device_key) VALUES(?,'staff','expired',?,?,'durable-staff')",
  )
  .run(staffDevice.endpoint, JSON.stringify(staffDevice), Date.now() - 1000);
function addOrder(id, kind = "automatic") {
  const token = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO orders(id,token,owner,idem,payload,total,status,created) VALUES(?,?,'guest',?, ?,45,?,?)",
    )
    .run(
      id,
      token,
      crypto.randomUUID(),
      JSON.stringify({ items: [], type: "takeaway", queueNumber: id }),
      kind === "staff_new" ? "waiting" : "ready",
      new Date().toISOString(),
    );
  sqlite
    .prepare(
      "INSERT INTO push_events(id,order_id,kind,created) VALUES(?,?,?,?)",
    )
    .run("event:" + id, id, kind, Date.now());
  sqlite
    .prepare(
      "INSERT INTO push_order_devices(id,order_id,subscription_id,created) VALUES(?,?,?,?)",
    )
    .run("device:" + id, id, device.endpoint, Date.now());
  return token;
}
function deleteOrder(id) {
  sqlite.prepare("DELETE FROM push_deliveries WHERE order_id=?").run(id);
  sqlite.prepare("DELETE FROM push_events WHERE order_id=?").run(id);
  sqlite.prepare("DELETE FROM push_order_devices WHERE order_id=?").run(id);
  sqlite.prepare("DELETE FROM orders WHERE id=?").run(id);
}
let sent = 0;
const transport = async () => {
  sent++;
  return new Response(null, { status: 201 });
};
try {
  await build({
    entryPoints: ["lib/push-engine.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(temp, "engine.mjs"),
    logLevel: "silent",
  });
  await build({
    entryPoints: ["lib/push.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "cloudflare:workers": path.join(temp, "env.mjs") },
    outfile: path.join(temp, "push.mjs"),
    logLevel: "silent",
  });
  const { processPushEvent } = await import(
    pathToFileURL(path.join(temp, "engine.mjs"))
  );
  const { registerOrderPush } = await import(
    pathToFileURL(path.join(temp, "push.mjs"))
  );
  addOrder(20);
  for (const [id, kind] of [
    [1, "automatic"],
    [2, "staff_new"],
  ]) {
    addOrder(id, kind);
    const pause = barrier();
    deliveryBarrier = pause;
    const work = processPushEvent(DB, "event:" + id, keys, transport);
    await pause.reached;
    deleteOrder(id);
    pause.release();
    const result = await work;
    assert.equal(result.accepted, 0);
    assert.equal(
      sent,
      0,
      "a delivery must not start for an order deleted after event/device reads",
    );
    assert.equal(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM push_deliveries WHERE order_id=?")
        .get(id).n,
      0,
    );
    assert.equal(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM push_events WHERE order_id=?")
        .get(id).n,
      0,
    );
  }
  addOrder(3);
  const pause = barrier();
  deliveryBarrier = pause;
  const work = processPushEvent(DB, "event:3", keys, transport);
  await pause.reached;
  sqlite.prepare("DELETE FROM push_events WHERE id='event:3'").run();
  pause.release();
  await work;
  assert.equal(
    sent,
    0,
    "an event removed while the order remains must not create a delivery",
  );
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM push_deliveries WHERE order_id=3")
      .get().n,
    0,
  );

  const positive = await processPushEvent(DB, "event:20", keys, transport);
  assert.equal(
    positive.accepted,
    1,
    "unrelated existing orders still deliver normally",
  );
  assert.equal(sent, 1);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM push_order_devices WHERE order_id=20")
      .get().n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM staff_push_devices").get().n,
    1,
  );

  const registrationToken = addOrder(4);
  sqlite.prepare("DELETE FROM push_order_devices WHERE order_id=4").run();
  const registrationPause = barrier();
  registrationBarrier = registrationPause;
  const registration = registerOrderPush(
    "guest",
    subscriptions("late-register"),
    [registrationToken],
  );
  await registrationPause.reached;
  deleteOrder(4);
  registrationPause.release();
  await registration;
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM push_order_devices WHERE order_id=4")
      .get().n,
    0,
    "registration cannot add a dangling device binding after deletion",
  );
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM push_events WHERE order_id=4")
      .get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE id=4").get().n,
    0,
  );
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE id=?")
      .get(device.endpoint).n,
    1,
    "a shared existing subscription remains available to the surviving order",
  );
  console.log(
    "PASS: deleting an order or event during push dispatch creates no late delivery; late registration creates no dangling order binding; unrelated notifications and shared/staff devices are preserved",
  );
} finally {
  delete globalThis.__deleteOrderPushEnv;
  sqlite.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
