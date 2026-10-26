import { sendPushRequest, type PushKeys } from "./webpush";
type Database = {
  prepare: (sql: string) => any;
  batch: (statements: any[]) => Promise<any[]>;
};
export type PushResult = {
  accepted: number;
  failed: number;
  expired: number;
  devices: number;
  status: string;
};
export async function processPushEvent(
  db: Database,
  eventId: string,
  keys: PushKeys | null,
  transport: typeof fetch = fetch,
): Promise<PushResult> {
  const result: PushResult = {
    accepted: 0,
    failed: 0,
    expired: 0,
    devices: 0,
    status: "duplicate",
  };
  const claim = await db
    .prepare(
      "UPDATE push_events SET status='sending' WHERE id=? AND status='queued'",
    )
    .bind(eventId)
    .run();
  if (!claim.meta.changes) return result;
  const event = await db
    .prepare(
      "SELECT e.*,o.token,o.payload,o.status AS order_status FROM push_events e JOIN orders o ON o.id=e.order_id WHERE e.id=?",
    )
    .bind(eventId)
    .first();
  if (!event) return result;
  try {
    const staffEvent = event.kind === "staff_new";
    if (
      staffEvent
        ? event.order_status !== "waiting" ||
          Date.now() - event.created > 600000
        : event.order_status !== "ready"
    ) {
      result.status = "skipped";
      return result;
    }
    if (!keys) {
      result.status = "not_configured";
      return result;
    }
    const rows = staffEvent
      ? await db
          .prepare(
            "SELECT d.id,d.value FROM staff_push_devices d JOIN users u ON u.id=d.user_id WHERE u.active=1 AND u.role IN('admin','staff') AND (d.device_key IS NOT NULL OR EXISTS(SELECT 1 FROM sessions s WHERE s.id=d.session_id AND s.user_id=u.id AND s.expires>?)) AND d.created<=? LIMIT 50",
          )
          .bind(Date.now(), event.created)
          .all()
      : await db
          .prepare(
            "SELECT s.id,s.value FROM push_order_devices d JOIN subscriptions s ON s.id=d.subscription_id WHERE d.order_id=? LIMIT 5",
          )
          .bind(event.order_id)
          .all();
    result.devices = rows.results.length;
    if (!result.devices) {
      result.status = "no_devices";
      return result;
    }
    await Promise.all(
      rows.results.map(async (row: any) => {
        const hash = await deviceHash(row.id);
        const deliveryId =
          (event.kind === "manual" || staffEvent
            ? event.id
            : "auto:" + event.order_id) +
          ":" +
          hash;
        const inserted = await db
          .prepare(
            "INSERT OR IGNORE INTO push_deliveries(id,event_id,order_id,device,status,created) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            deliveryId,
            event.id,
            event.order_id,
            hash,
            "sending",
            Date.now(),
          )
          .run();
        if (!inserted.meta.changes) return;
        let status = "failed",
          http: number | null = null,
          error = "";
        try {
          const subscription = JSON.parse(row.value);
          if (
            subscription.expirationTime &&
            subscription.expirationTime <= Date.now()
          ) {
            status = "expired";
            error = "subscription_expired";
          } else {
            const number = "OS-" + String(event.order_id).padStart(4, "0");
            const order = staffEvent ? JSON.parse(event.payload) : null;
            const payload = staffEvent
              ? {
                  title: "☕ Old School Coffee",
                  body: `มีออเดอร์ใหม่ #${number} · ${order.type === "takeaway" ? "รับกลับบ้าน" : "โต๊ะ " + order.table} กรุณาเปิดหน้ารับออเดอร์ค่ะ`,
                  tag: "old-school-staff-" + number,
                  data: {
                    url: "/admin?view=orders",
                    audience: "staff",
                    number,
                    eventId: event.id,
                  },
                }
              : {
                  title: "☕ Old School Coffee",
                  body: `เครื่องดื่มของคุณพร้อมแล้ว! ออเดอร์ #${number} กรุณามารับที่เคาน์เตอร์ค่ะ`,
                  tag: "old-school-" + number,
                  data: {
                    url: "/?view=orders#order=" + event.token,
                    number,
                    eventId: event.id,
                  },
                };
            const response = await sendPushRequest(
              subscription,
              payload,
              keys,
              transport,
            );
            http = response.status;
            if (response.ok) {
              status = "accepted";
              result.accepted++;
            } else if (http === 404 || http === 410) {
              status = "expired";
              error = "subscription_gone";
            } else {
              error =
                http >= 300 && http < 400
                  ? "push_redirect_blocked"
                  : http === 401 || http === 403
                    ? "push_auth_rejected"
                    : http === 429
                      ? "push_rate_limited"
                      : "push_http_error";
            }
          }
        } catch (e: any) {
          error =
            e?.name === "TimeoutError" || e?.name === "AbortError"
              ? "push_timeout_unknown"
              : "push_request_failed";
        }
        if (status === "expired") {
          result.expired++;
          if (staffEvent) {
            await db
              .prepare("DELETE FROM staff_push_devices WHERE id=?")
              .bind(row.id)
              .run();
          } else
            await db.batch([
              db
                .prepare(
                  "DELETE FROM push_order_devices WHERE subscription_id=?",
                )
                .bind(row.id),
              db.prepare("DELETE FROM subscriptions WHERE id=?").bind(row.id),
            ]);
        } else if (status !== "accepted") result.failed++;
        await db
          .prepare(
            "UPDATE push_deliveries SET status=?,http_status=?,error=? WHERE id=?",
          )
          .bind(status, http, error, deliveryId)
          .run();
      }),
    );
    result.status = result.accepted
      ? "accepted"
      : result.failed
        ? "failed"
        : result.expired
          ? "expired"
          : "duplicate";
    return result;
  } catch {
    result.status = "failed";
    result.failed++;
    console.error("push_event_failed", { eventId, orderId: event.order_id });
    return result;
  } finally {
    await db
      .prepare("UPDATE push_events SET status=?,message=? WHERE id=?")
      .bind(result.status, JSON.stringify(result), event.id)
      .run();
  }
}
export async function deviceHash(endpoint: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}

// Token-match ensures an idempotent retry cannot enqueue a second new-order alert.
export function newOrderPushStatement(db: Database, token: string) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO push_events(id,order_id,kind,created) SELECT 'staff-new:'||id,id,'staff_new',? FROM orders WHERE token=?",
    )
    .bind(Date.now(), token);
}
