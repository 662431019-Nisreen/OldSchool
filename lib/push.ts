import { env } from "cloudflare:workers";
import { DB } from "./server";
import { processPushEvent } from "./push-engine";
import { validatePushKeys, type PushKeys } from "./webpush";
let checked: Promise<PushKeys | null> | null = null;
export function configuredPushKeys() {
  if (!checked)
    checked = (async () => {
      const e = env as any;
      const keys = {
        publicKey: e.VAPID_PUBLIC_KEY,
        privateKey: e.VAPID_PRIVATE_KEY,
        subject: e.VAPID_SUBJECT,
      };
      if (!keys.publicKey || !keys.privateKey || !keys.subject) return null;
      try {
        await validatePushKeys(keys);
        return keys;
      } catch {
        console.error("push_configuration_invalid");
        return null;
      }
    })();
  return checked;
}
export async function sendPushEvent(id: string) {
  return processPushEvent(DB(), id, await configuredPushKeys());
}
let cleanupAt = 0;
export async function drainPendingPush() {
  const db = DB();
  if (Date.now() > cleanupAt) {
    cleanupAt = Date.now() + 86400000;
    const cutoff = Date.now() - 30 * 86400000;
    await db.batch([
      db
        .prepare(
          "DELETE FROM staff_push_devices WHERE session_id NOT IN(SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires>? AND u.active=1 AND u.role IN('admin','staff'))",
        )
        .bind(Date.now()),
      db.prepare("DELETE FROM push_deliveries WHERE created<?").bind(cutoff),
      db.prepare("DELETE FROM push_events WHERE created<?").bind(cutoff),
      db
        .prepare(
          "DELETE FROM push_order_devices WHERE order_id IN(SELECT id FROM orders WHERE status='done') OR created<?",
        )
        .bind(cutoff),
      db.prepare(
        "DELETE FROM subscriptions WHERE NOT EXISTS(SELECT 1 FROM push_order_devices WHERE subscription_id=subscriptions.id)",
      ),
    ]);
  }
  const rows = await db
    .prepare(
      "SELECT id FROM push_events WHERE status='queued' ORDER BY created LIMIT 2",
    )
    .all<{ id: string }>();
  for (const row of rows.results) await sendPushEvent(row.id);
}
export async function registerOrderPush(guest: string, raw: any, tokens: any) {
  const { validateSubscription } = await import("./webpush");
  const { deviceHash } = await import("./push-engine");
  if (!(await configuredPushKeys()))
    throw new Error("ระบบแจ้งเตือนยังไม่พร้อม ติดตามออเดอร์ผ่านเว็บไซต์ได้");
  if (
    !Array.isArray(tokens) ||
    !tokens.length ||
    tokens.length > 20 ||
    tokens.some(
      (t) => typeof t !== "string" || !/^[-a-zA-Z0-9]{20,80}$/.test(t),
    )
  )
    throw new Error("กรุณาเลือกออเดอร์ที่จะรับแจ้งเตือน");
  const subscription = await validateSubscription(raw),
    db = DB();
  const orders = await db
    .prepare(
      `SELECT id,token,status FROM orders WHERE token IN (${tokens.map(() => "?").join(",")}) AND status!='done'`,
    )
    .bind(...tokens)
    .all<any>();
  if (orders.results.length !== new Set(tokens).size)
    throw new Error("ไม่พบออเดอร์หรือออเดอร์เสร็จสิ้นแล้ว");
  const existing = await db
    .prepare("SELECT owner FROM subscriptions WHERE id=?")
    .bind(subscription.endpoint)
    .first<{ owner: string }>();
  if (existing && existing.owner !== guest)
    throw new Error("อุปกรณ์นี้ผูกกับการใช้งานอื่น กรุณาลงทะเบียนอุปกรณ์ใหม่");
  const ownerCount = await db
    .prepare("SELECT count(*) AS n FROM subscriptions WHERE owner=?")
    .bind(guest)
    .first<{ n: number }>();
  if (!existing && (ownerCount?.n || 0) >= 5)
    throw new Error("ลงทะเบียนอุปกรณ์ครบแล้ว กรุณาใช้อุปกรณ์เดิม");
  const hash = await deviceHash(subscription.endpoint),
    now = Date.now();
  const statements = [
    db
      .prepare(
        "INSERT INTO subscriptions(id,owner,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE subscriptions.owner=excluded.owner",
      )
      .bind(subscription.endpoint, guest, JSON.stringify(subscription)),
  ];
  for (const o of orders.results) {
    const count = await db
      .prepare(
        "SELECT count(*) AS n FROM push_order_devices WHERE order_id=? AND subscription_id!=?",
      )
      .bind(o.id, subscription.endpoint)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 5)
      throw new Error("ออเดอร์นี้ลงทะเบียนอุปกรณ์ครบแล้ว");
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO push_order_devices(id,order_id,subscription_id,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND owner=?)",
        )
        .bind(
          o.id + ":" + hash,
          o.id,
          subscription.endpoint,
          now,
          subscription.endpoint,
          guest,
        ),
    );
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO push_events(id,order_id,kind,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='ready') AND EXISTS(SELECT 1 FROM push_order_devices WHERE id=?)",
        )
        .bind(
          "late:" + o.id + ":" + hash,
          o.id,
          "automatic",
          now,
          o.id,
          o.id + ":" + hash,
        ),
    );
  }
  const saved = await db.batch(statements);
  if (!saved[0].meta.changes)
    throw new Error("อุปกรณ์นี้ถูกลงทะเบียนในการใช้งานอื่นแล้ว");
  return { ok: true, registered: orders.results.map((o) => o.token) };
}

export async function registerStaffPush(
  userId: string,
  sessionId: string,
  raw: any,
) {
  const { validateSubscription } = await import("./webpush");
  if (!(await configuredPushKeys())) throw new Error("ระบบ Push ยังไม่พร้อม");
  const subscription = await validateSubscription(raw),
    db = DB();
  const existing = await db
    .prepare("SELECT user_id FROM staff_push_devices WHERE id=?")
    .bind(subscription.endpoint)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== userId)
    throw new Error(
      "อุปกรณ์นี้ลงทะเบียนกับบัญชีอื่น กรุณาปิดแจ้งเตือนจากบัญชีเดิมก่อน",
    );
  const total = await db
    .prepare("SELECT count(*) n FROM staff_push_devices")
    .first<{ n: number }>();
  const count = await db
    .prepare("SELECT count(*) n FROM staff_push_devices WHERE user_id=?")
    .bind(userId)
    .first<{ n: number }>();
  if (!existing && ((count?.n || 0) >= 5 || (total?.n || 0) >= 50))
    throw new Error(
      "ลงทะเบียนอุปกรณ์ครบแล้ว กรุณาปิดแจ้งเตือนเครื่องที่ไม่ใช้",
    );
  const saved = await db
    .prepare(
      "INSERT INTO staff_push_devices(id,user_id,session_id,value,created) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,value=excluded.value WHERE staff_push_devices.user_id=excluded.user_id",
    )
    .bind(
      subscription.endpoint,
      userId,
      sessionId,
      JSON.stringify(subscription),
      Date.now(),
    )
    .run();
  if (!saved.meta.changes) throw new Error("ลงทะเบียนอุปกรณ์ไม่สำเร็จ");
  return { ok: true, registered: true };
}
