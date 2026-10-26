import {
  DB,
  cookie,
  getConfig,
  hash,
  user,
  validateCart,
  unpack,
  publicOrder,
  log,
} from "@/lib/server";
import { newOrderPushStatement } from "@/lib/push-engine";
import { env } from "cloudflare:workers";
import { reportOrders } from "@/lib/report-server";
import { summarizeSales } from "@/lib/reports";
import { buildReceipt } from "@/lib/receipt";
const json = (data: any, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const statuses = ["waiting", "making", "ready", "done"];
export async function GET(r: Request) {
  try {
    const url = new URL(r.url),
      action = url.searchParams.get("action") || "menu",
      u = await user(r);
    if (action === "menu") {
      const config = await getConfig();
      const owner = cookie(r, "os_guest") || crypto.randomUUID();
      return json(
        {
          config: {
            ...config,
            products: config.products.filter((p: any) => !p.hidden),
          },
          user: u,
        },
        200,
        {
          "Set-Cookie": `os_guest=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`,
        },
      );
    }
    if (action === "setup") {
      const count = await DB()
        .prepare("SELECT count(*) as n FROM users")
        .first<{ n: number }>();
      return json({ needed: !count?.n });
    }
    if (action === "orders") {
      if (!u) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
      const rows = await DB()
        .prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500")
        .all();
      return json({ orders: rows.results.map(unpack), user: u });
    }
    if (action === "mine") {
      const rows = await DB()
        .prepare("SELECT * FROM orders WHERE owner=? ORDER BY id DESC LIMIT 20")
        .bind(cookie(r, "os_guest") || "")
        .all();
      return json({ orders: rows.results.map(publicOrder) });
    }
    if (action === "receipt") {
      const reply = (data: any, status = 200) =>
        json(data, status, { "Cache-Control": "private, no-store" });
      if (!u) return reply({ error: "กรุณาเข้าสู่ระบบ" }, 401);
      if (!["admin", "staff"].includes(u.role))
        return reply({ error: "ไม่มีสิทธิ์" }, 403);
      const rawId = url.searchParams.get("id") || "";
      const id = Number(rawId);
      if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id))
        return reply({ error: "ออเดอร์ไม่ถูกต้อง" }, 400);
      const row = await DB()
        .prepare("SELECT * FROM orders WHERE id=?")
        .bind(id)
        .first<any>();
      if (!row) return reply({ error: "ไม่พบออเดอร์" }, 404);
      const config = await getConfig();
      try {
        return reply({ receipt: buildReceipt(unpack(row), config) });
      } catch (e: any) {
        return reply({ error: e.message }, 409);
      }
    }
    if (action === "report") {
      if (u?.role !== "admin") return json({ error: "เฉพาะผู้ดูแลระบบ" }, 403);
      try {
        const result = await reportOrders(url.searchParams);
        return json({ ...result, summary: summarizeSales(result.orders) });
      } catch (e: any) {
        return json({ error: e.message }, 400);
      }
    }
    if (action === "admin") {
      if (u?.role !== "admin") return json({ error: "ไม่มีสิทธิ์" }, 403);
      const config = await getConfig();
      const users = await DB()
        .prepare("SELECT id,name,role,active FROM users")
        .all();
      return json({ config, users: users.results, user: u });
    }
    if (action === "push-key") {
      const { configuredPushKeys } = await import("@/lib/push");
      const keys = await configuredPushKeys();
      return json({ key: keys?.publicKey || null, configured: !!keys });
    }
    if (action === "push-logs") {
      if (!u || !["admin", "staff"].includes(u.role))
        return json({ error: "ไม่มีสิทธิ์" }, 403);
      const id = Number(url.searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1)
        return json({ error: "ออเดอร์ไม่ถูกต้อง" }, 400);
      const events = await DB()
        .prepare(
          "SELECT id,kind,status,created,message FROM push_events WHERE order_id=? ORDER BY created DESC LIMIT 20",
        )
        .bind(id)
        .all();
      const deliveries = await DB()
        .prepare(
          "SELECT event_id,status,http_status,error,created FROM push_deliveries WHERE order_id=? ORDER BY created DESC LIMIT 100",
        )
        .bind(id)
        .all();
      return json({ events: events.results, deliveries: deliveries.results });
    }
    return json({ error: "ไม่พบรายการ" }, 404);
  } catch (e: any) {
    return json(
      { error: e.message },
      500,
      new URL(r.url).searchParams.get("action") === "receipt"
        ? { "Cache-Control": "private, no-store" }
        : {},
    );
  }
}
export async function POST(r: Request) {
  try {
    if (
      r.headers.get("origin") &&
      r.headers.get("origin") !== new URL(r.url).origin
    )
      return json({ error: "Invalid origin" }, 403);
    const b = (await r.json()) as any;
    const u = await user(r),
      db = DB();
    if (b.action === "setup") {
      const secret = (env as any).POS_SETUP_KEY;
      if (!secret || b.secret !== secret)
        return json(
          { error: "ต้องใช้ POS_SETUP_KEY ที่เจ้าของร้านตั้งค่าใน Server" },
          403,
        );
      if (typeof b.password !== "string" || b.password.length < 10)
        return json({ error: "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร" }, 400);
      const salt = crypto.randomUUID(),
        h = await hash(b.password, salt);
      const result = await db
        .prepare(
          "INSERT INTO users(id,name,role,salt,hash) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM users)",
        )
        .bind("owner", "เจ้าของร้าน", "admin", salt, h)
        .run()
        .catch(() => null);
      if (!result) return json({ error: "ตั้งค่าผู้ดูแลไม่สำเร็จ" }, 409);
      return json({ ok: true });
    }
    if (b.action === "login") {
      const target = String(b.username || "").slice(0, 80);
      const attempts = await db
        .prepare(
          "SELECT COUNT(*) as n FROM audit WHERE action='login_failed' AND target=? AND created>?",
        )
        .bind(target, new Date(Date.now() - 900000).toISOString())
        .first<{ n: number }>();
      if ((attempts?.n || 0) >= 10)
        return json(
          { error: "พยายามเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที" },
          429,
        );
      const a = await db
        .prepare("SELECT * FROM users WHERE id=? AND active=1")
        .bind(String(b.username || ""))
        .first<any>();
      if (
        !a ||
        typeof b.password !== "string" ||
        b.password.length > 200 ||
        (await hash(b.password, a.salt)) !== a.hash
      ) {
        await log("anonymous", "login_failed", target);
        return json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);
      }
      const sid = crypto.randomUUID();
      await db
        .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
        .bind(sid, a.id, Date.now() + 43200000)
        .run();
      return json(
        { ok: true, user: { id: a.id, name: a.name, role: a.role } },
        200,
        {
          "Set-Cookie": `os_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(r.url).protocol === "https:" ? "; Secure" : ""}`,
        },
      );
    }
    if (b.action === "logout") {
      const session = cookie(r, "os_session") || "";
      await db.batch([
        db
          .prepare(
            "DELETE FROM staff_push_devices WHERE session_id=? OR device_key=?",
          )
          .bind(session, cookie(r, "os_staff_device") || ""),
        db.prepare("DELETE FROM sessions WHERE id=?").bind(session),
      ]);
      const response = json({ ok: true }, 200, {
        "Set-Cookie":
          "os_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
      response.headers.append(
        "Set-Cookie",
        "os_staff_device=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return response;
    }
    if (b.action === "order") {
      const owner = cookie(r, "os_guest");
      if (!owner) return json({ error: "กรุณาโหลดหน้าร้านใหม่" }, 400);
      if (typeof b.idem !== "string" || !/^[-a-zA-Z0-9]{20,80}$/.test(b.idem))
        return json({ error: "รหัสคำสั่งไม่ถูกต้อง" }, 400);
      const existing = await db
        .prepare("SELECT * FROM orders WHERE idem=? AND owner=?")
        .bind(b.idem, owner)
        .first();
      if (existing) return json({ order: publicOrder(existing) });
      const c = await getConfig();
      if (c.accepting === false)
        return json({ error: "ร้านปิดรับออเดอร์ชั่วคราว" }, 409);
      if (
        !["dinein", "takeaway"].includes(b.type) ||
        (b.type === "dinein" &&
          (!Number.isInteger(b.table) || b.table < 1 || b.table > c.tables))
      )
        return json({ error: "กรุณาเลือกโต๊ะที่ถูกต้อง" }, 400);
      const items = validateCart(b.items, c.products),
        total = items.reduce((s, x) => s + x.price * x.qty, 0),
        token = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO orders(token,owner,idem,payload,total,created) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            token,
            owner,
            b.idem,
            JSON.stringify({
              items,
              type: b.type,
              table: b.type === "dinein" ? b.table : null,
              method: "counter",
            }),
            total,
            new Date().toISOString(),
          ),
        newOrderPushStatement(db, token),
      ]);
      const o = await db
        .prepare("SELECT * FROM orders WHERE idem=? AND owner=?")
        .bind(b.idem, owner)
        .first();
      if (!o) return json({ error: "ไม่สามารถสร้างออเดอร์" }, 409);
      return json({ order: publicOrder(o) });
    }
    if (b.action === "track") {
      if (typeof b.token !== "string" || !/^[-a-zA-Z0-9]{20,80}$/.test(b.token))
        return json({ error: "ไม่พบออเดอร์" }, 404);
      const o = await db
        .prepare("SELECT * FROM orders WHERE token=?")
        .bind(b.token)
        .first();
      return o
        ? json({ order: publicOrder(o) })
        : json({ error: "ไม่พบออเดอร์" }, 404);
    }
    if (b.action === "subscribe") {
      const owner = cookie(r, "os_guest");
      if (!owner) return json({ error: "กรุณาโหลดหน้าร้านใหม่" }, 400);
      const { registerOrderPush } = await import("@/lib/push");
      return json(await registerOrderPush(owner, b.subscription, b.tokens));
    }
    if (b.action === "push-registration") {
      const owner = cookie(r, "os_guest");
      const rows = await db
        .prepare(
          "SELECT o.token FROM push_order_devices d JOIN subscriptions s ON s.id=d.subscription_id JOIN orders o ON o.id=d.order_id WHERE s.id=? AND s.owner=?",
        )
        .bind(String(b.endpoint || ""), owner || "")
        .all();
      return json({ registered: rows.results.map((o: any) => o.token) });
    }
    if (!u) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (
      [
        "staff-push-register",
        "staff-push-state",
        "staff-push-disable",
      ].includes(b.action)
    ) {
      if (!["admin", "staff"].includes(u.role))
        return json({ error: "ไม่มีสิทธิ์" }, 403);
      const session = cookie(r, "os_session") || "";
      const existingKey = cookie(r, "os_staff_device") || "";
      const deviceKey = /^[-a-zA-Z0-9]{20,80}$/.test(existingKey)
        ? existingKey
        : crypto.randomUUID();
      const deviceHeader = {
        "Set-Cookie": `os_staff_device=${deviceKey}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${new URL(r.url).protocol === "https:" ? "; Secure" : ""}`,
      };
      if (b.action === "staff-push-register") {
        const { registerStaffPush } = await import("@/lib/push");
        return json(
          await registerStaffPush(u.id, session, b.subscription, deviceKey),
          200,
          deviceHeader,
        );
      }
      if (b.action === "staff-push-disable") {
        if (
          b.endpoint != null &&
          (typeof b.endpoint !== "string" || b.endpoint.length > 3000)
        )
          return json({ error: "อุปกรณ์ไม่ถูกต้อง" }, 400);
        await db
          .prepare(
            "DELETE FROM staff_push_devices WHERE (id=? OR device_key=?) AND user_id=?",
          )
          .bind(b.endpoint || "", existingKey, u.id)
          .run();
        return json({ ok: true, registered: false });
      }
      if (typeof b.endpoint !== "string" || b.endpoint.length > 3000)
        return json({ error: "อุปกรณ์ไม่ถูกต้อง" }, 400);
      const row = await db
        .prepare("SELECT id FROM staff_push_devices WHERE id=? AND user_id=?")
        .bind(b.endpoint, u.id)
        .first();
      if (row) {
        // Rebind to this authenticated installation; existing permission needs no new prompt.
        await db
          .prepare(
            "UPDATE staff_push_devices SET device_key=?,session_id=? WHERE id=? AND user_id=?",
          )
          .bind(deviceKey, session, b.endpoint, u.id)
          .run();
      }
      return json({ registered: !!row }, 200, row ? deviceHeader : {});
    }
    if (b.action === "counter-order" || b.action === "edit-order") {
      if (!["admin", "staff"].includes(u.role))
        return json({ error: "ไม่มีสิทธิ์" }, 403);
      const editing = b.action === "edit-order";
      const old = editing
        ? await db
            .prepare("SELECT * FROM orders WHERE id=?")
            .bind(b.id)
            .first<any>()
        : null;
      if (editing && !old) return json({ error: "ไม่พบออเดอร์" }, 404);
      if (old && old.version !== b.version)
        return json({ error: "ออเดอร์ถูกแก้ไขแล้ว กรุณาปิดแล้วเปิดใหม่" }, 409);
      if (old?.payment === "paid" && u.role !== "admin")
        return json({ error: "เฉพาะเจ้าของร้านแก้ยอดที่ชำระแล้วได้" }, 403);
      if (old?.status === "done" && old.payment !== "paid")
        return json({ error: "ออเดอร์นี้ปิดแล้ว" }, 409);
      const owner = "counter:" + u.id;
      if (!editing) {
        if (typeof b.idem !== "string" || !/^[-a-zA-Z0-9]{20,80}$/.test(b.idem))
          return json({ error: "รหัสคำสั่งไม่ถูกต้อง" }, 400);
        const existing = await db
          .prepare("SELECT * FROM orders WHERE idem=? AND owner=?")
          .bind(b.idem, owner)
          .first();
        if (existing) return json({ order: unpack(existing) });
      }
      const c = await getConfig();
      if (
        !["dinein", "takeaway"].includes(b.type) ||
        (b.type === "dinein" &&
          (!Number.isInteger(b.table) || b.table < 1 || b.table > c.tables))
      )
        return json({ error: "กรุณาเลือกโต๊ะที่ถูกต้อง" }, 400);
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 60)
        return json({ error: "กรุณาเพิ่มรายการสินค้า" }, 400);
      const previous = old ? JSON.parse(old.payload) : null;
      // Retained lines keep the price/options sold at the time, even if the menu later changes.
      // Only a server-owned snapshot index can retain a price; new or changed options use today's catalog.
      const items = b.items.map((line: any) => {
        const original = Number.isInteger(line.originalIndex)
          ? previous?.items[line.originalIndex]
          : null;
        if (
          original &&
          original.productId === line.productId &&
          original.variant === line.variant &&
          original.sweet === line.sweet
        ) {
          if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 30)
            throw new Error("จำนวนสินค้าไม่ถูกต้อง");
          if (line.qty > original.qty) validateCart([line], c.products);
          return {
            ...original,
            qty: line.qty,
            note: String(line.note || "").slice(0, 200),
          };
        }
        return validateCart([line], c.products)[0];
      });
      const retained = b.items
        .filter((i: any) => Number.isInteger(i.originalIndex))
        .map((i: any) => i.originalIndex);
      if (new Set(retained).size !== retained.length)
        return json({ error: "รายการซ้ำ กรุณาเปิดออเดอร์ใหม่" }, 400);
      const subtotal = items.reduce(
        (s: number, i: any) => s + i.price * i.qty,
        0,
      );
      const adjustment = b.adjustment ?? 0;
      const reason = String(b.reason || "")
        .trim()
        .slice(0, 200);
      if (
        !Number.isInteger(adjustment) ||
        Math.abs(adjustment) > 100000 ||
        subtotal + adjustment < 0 ||
        ((editing || adjustment !== 0) && !reason)
      )
        return json({ error: "ตรวจสอบยอดปรับราคาและระบุเหตุผล" }, 400);
      if (adjustment !== (previous?.adjustment || 0) && u.role !== "admin")
        return json({ error: "เฉพาะเจ้าของร้านปรับราคาได้" }, 403);
      const total = subtotal + adjustment;
      const delta = old ? total - old.total : 0;
      if (
        old?.payment === "paid" &&
        delta !== 0 &&
        !["cash", "qr"].includes(b.settlementMethod)
      )
        return json(
          { error: "ระบุวิธีรับเงินเพิ่มหรือคืนเงินที่ดำเนินการแล้ว" },
          400,
        );
      const now = new Date().toISOString();
      const revisions = previous?.revisions || [];
      if (revisions.length >= 100)
        return json(
          { error: "ออเดอร์นี้มีประวัติแก้ไขครบ 100 ครั้งแล้ว" },
          409,
        );
      const revision = old
        ? {
            at: now,
            actor: u.name,
            actorId: u.id,
            reason,
            before: {
              items: previous.items,
              total: old.total,
              type: previous.type,
              table: previous.table,
              adjustment: previous.adjustment || 0,
            },
            after: {
              items,
              total,
              type: b.type,
              table: b.type === "dinein" ? b.table : null,
              adjustment,
            },
            delta,
            settlement:
              old.payment === "paid" && delta !== 0
                ? { method: b.settlementMethod, amount: delta }
                : null,
          }
        : null;
      const payload = {
        ...(previous || {}),
        items,
        type: b.type,
        table: b.type === "dinein" ? b.table : null,
        method: previous?.method || "counter",
        source: previous?.source || (editing ? "qr" : "counter"),
        subtotal,
        adjustment,
        adjustmentReason: adjustment
          ? adjustment === previous?.adjustment
            ? previous?.adjustmentReason
            : reason
          : "",
        revisions: revision ? [...revisions, revision] : [],
        ...(editing ? {} : { createdBy: u.name }),
      };
      if (editing) {
        const changed = await db
          .prepare(
            "UPDATE orders SET payload=?,total=?,version=version+1 WHERE id=? AND version=? AND payment=?",
          )
          .bind(JSON.stringify(payload), total, old.id, b.version, old.payment)
          .run();
        if (!changed.meta.changes)
          return json(
            { error: "ออเดอร์ถูกแก้ไขแล้ว กรุณาปิดแล้วเปิดใหม่" },
            409,
          );
      } else {
        const token = crypto.randomUUID();
        await db.batch([
          db
            .prepare(
              "INSERT OR IGNORE INTO orders(token,owner,idem,payload,total,created) VALUES(?,?,?,?,?,?)",
            )
            .bind(token, owner, b.idem, JSON.stringify(payload), total, now),
          newOrderPushStatement(db, token),
        ]);
      }
      await log(u.id, b.action, editing ? String(old.id) : b.idem);
      const saved = editing
        ? await db
            .prepare("SELECT * FROM orders WHERE id=?")
            .bind(old.id)
            .first()
        : await db
            .prepare("SELECT * FROM orders WHERE idem=? AND owner=?")
            .bind(b.idem, owner)
            .first();
      if (!saved) return json({ error: "บันทึกไม่สำเร็จ" }, 409);
      return json({ order: unpack(saved) });
    }
    if (b.action === "status" || b.action === "payment") {
      const o = await db
        .prepare("SELECT * FROM orders WHERE id=?")
        .bind(b.id)
        .first<any>();
      if (!o) return json({ error: "ไม่พบออเดอร์" }, 404);
      if (
        b.action === "status" &&
        (statuses.indexOf(b.status) !== statuses.indexOf(o.status) + 1 ||
          (b.status === "done" && o.payment !== "paid"))
      )
        return json(
          { error: "ตรวจสอบสถานะ และยืนยันชำระเงินก่อนปิดออเดอร์" },
          409,
        );
      const field = b.action === "status" ? "status" : "payment",
        value = b.action === "status" ? b.status : "paid";
      if (b.action === "payment" && !["cash", "qr"].includes(b.method))
        return json({ error: "กรุณาระบุวิธีรับชำระเงิน" }, 400);
      const changed =
        b.action === "payment"
          ? await db
              .prepare(
                "UPDATE orders SET payment='paid',payload=?,version=version+1 WHERE id=? AND version=? AND payment='unpaid'",
              )
              .bind(
                JSON.stringify({ ...JSON.parse(o.payload), method: b.method }),
                b.id,
                b.version,
              )
              .run()
          : (
              await db.batch([
                db
                  .prepare(
                    `UPDATE orders SET ${field}=?,version=version+1 WHERE id=? AND version=?`,
                  )
                  .bind(value, b.id, b.version),
                db
                  .prepare(
                    "INSERT OR IGNORE INTO push_events(id,order_id,kind,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='ready' AND version=?)",
                  )
                  .bind(
                    "ready:" + b.id,
                    b.id,
                    "automatic",
                    Date.now(),
                    b.id,
                    b.version + 1,
                  ),
              ])
            )[0];
      if (!changed.meta.changes)
        return json({ error: "ออเดอร์ถูกแก้ไขแล้ว กรุณาโหลดใหม่" }, 409);
      await log(u.id, b.action, String(b.id));
      let push = null;
      if (value === "ready") {
        try {
          const { sendPushEvent } = await import("@/lib/push");
          push = await sendPushEvent("ready:" + b.id);
        } catch {
          console.error("push_dispatch_failed", { orderId: b.id });
        }
      }
      return json({ ok: true, push });
    }
    if (b.action === "call") {
      const now = Date.now(),
        id = "manual:" + crypto.randomUUID();
      const inserted = await db
        .prepare(
          "INSERT INTO push_events(id,order_id,kind,created) SELECT ?,?,'manual',? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='ready') AND NOT EXISTS(SELECT 1 FROM push_events WHERE order_id=? AND kind='manual' AND created>?)",
        )
        .bind(id, b.id, now, b.id, b.id, now - 30000)
        .run();
      if (!inserted.meta.changes)
        return json(
          {
            error:
              "เรียกได้เฉพาะออเดอร์พร้อมรับ และต้องเว้นอย่างน้อย 30 วินาที",
          },
          409,
        );
      const { sendPushEvent } = await import("@/lib/push");
      const push = await sendPushEvent(id);
      await log(u.id, "call", String(b.id));
      return json({ ok: true, sent: push.accepted, push });
    }
    if (u.role !== "admin") return json({ error: "เฉพาะผู้ดูแลระบบ" }, 403);
    if (b.action === "config") {
      const c = b.config;
      if (
        !c ||
        !Array.isArray(c.products) ||
        c.products.length > 300 ||
        !Number.isInteger(c.tables) ||
        c.tables < 1 ||
        c.tables > 100
      )
        return json({ error: "ข้อมูลร้านไม่ถูกต้อง" }, 400);
      const ids = new Set();
      for (const p of c.products) {
        if (
          !p.id ||
          ids.has(p.id) ||
          !p.name ||
          !p.category ||
          ![p.price, p.hot, p.cold, p.blend].some(
            (v) => typeof v === "number",
          ) ||
          [p.price, p.hot, p.cold, p.blend].some(
            (v) => v != null && (!Number.isInteger(v) || v < 0 || v > 10000),
          )
        )
          return json({ error: "ตรวจสอบชื่อและราคาสินค้า" }, 400);
        if (p.soldOut != null && typeof p.soldOut !== "boolean")
          return json({ error: "สถานะสินค้าหมดไม่ถูกต้อง" }, 400);
        if (
          p.sweetLevels &&
          (!Array.isArray(p.sweetLevels) ||
            !p.sweetLevels.length ||
            p.sweetLevels.length > 10 ||
            p.sweetLevels.some(
              (v: any) => !Number.isInteger(v) || v < 0 || v > 200,
            ))
        )
          return json({ error: "ระดับความหวานไม่ถูกต้อง" }, 400);
        ids.add(p.id);
      }
      await db
        .prepare("INSERT OR REPLACE INTO config(key,value) VALUES(?,?)")
        .bind("shop", JSON.stringify(c))
        .run();
      await log(u.id, "config", "shop");
      return json({ ok: true });
    }
    if (b.action === "user") {
      if (
        !/^[a-zA-Z0-9_-]{3,30}$/.test(b.id) ||
        !["staff", "admin"].includes(b.role) ||
        typeof b.password !== "string" ||
        b.password.length < 10
      )
        return json(
          { error: "ชื่อผู้ใช้ 3–30 ตัว และรหัสผ่านอย่างน้อย 10 ตัว" },
          400,
        );
      const salt = crypto.randomUUID();
      await db
        .prepare("INSERT INTO users(id,name,role,salt,hash) VALUES(?,?,?,?,?)")
        .bind(
          b.id,
          String(b.name).slice(0, 80),
          b.role,
          salt,
          await hash(b.password, salt),
        )
        .run();
      await log(u.id, "user", b.id);
      return json({ ok: true });
    }
    if (b.action === "user-role") {
      if (b.id === u.id || !["staff", "admin"].includes(b.role))
        return json({ error: "แก้สิทธิ์นี้ไม่ได้" }, 400);
      await db
        .prepare("UPDATE users SET role=? WHERE id=?")
        .bind(b.role, b.id)
        .run();
      await log(u.id, "user-role", b.id);
      return json({ ok: true });
    }
    if (b.action === "disable-user") {
      if (b.id === u.id) return json({ error: "ปิดบัญชีตนเองไม่ได้" }, 400);
      await db
        .prepare("UPDATE users SET active=? WHERE id=?")
        .bind(b.active ? 1 : 0, b.id)
        .run();
      return json({ ok: true });
    }
    return json({ error: "ไม่พบคำสั่ง" }, 400);
  } catch (e: any) {
    return json({ error: e.message || "เกิดข้อผิดพลาด" }, 400);
  }
}
