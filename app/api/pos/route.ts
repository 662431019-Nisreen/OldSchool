import {
  DB,
  cookie,
  getConfig,
  hash,
  user,
  validateCart,
  unpack,
  log,
} from "@/lib/server";
import { env } from "cloudflare:workers";
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
      return json({ orders: rows.results.map(unpack) });
    }
    if (action === "admin") {
      if (u?.role !== "admin") return json({ error: "ไม่มีสิทธิ์" }, 403);
      const config = await getConfig();
      const users = await DB()
        .prepare("SELECT id,name,role,active FROM users")
        .all();
      return json({ config, users: users.results, user: u });
    }
    if (action === "push-key")
      return json({ key: (env as any).VAPID_PUBLIC_KEY || null });
    return json({ error: "ไม่พบรายการ" }, 404);
  } catch (e: any) {
    return json({ error: e.message }, 500);
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
      await db
        .prepare("DELETE FROM sessions WHERE id=?")
        .bind(cookie(r, "os_session") || "")
        .run();
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "os_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
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
      if (existing) return json({ order: unpack(existing) });
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
      await db
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
        )
        .run();
      const o = await db
        .prepare("SELECT * FROM orders WHERE idem=? AND owner=?")
        .bind(b.idem, owner)
        .first();
      if (!o) return json({ error: "ไม่สามารถสร้างออเดอร์" }, 409);
      return json({ order: unpack(o) });
    }
    if (b.action === "subscribe") {
      const owner = cookie(r, "os_guest");
      const s = b.subscription;
      if (
        !owner ||
        !s ||
        typeof s.endpoint !== "string" ||
        !s.endpoint.startsWith("https://") ||
        !s.keys?.p256dh ||
        !s.keys?.auth
      )
        return json({ error: "ข้อมูลแจ้งเตือนไม่ถูกต้อง" }, 400);
      await db
        .prepare(
          "INSERT OR REPLACE INTO subscriptions(id,owner,value) VALUES(?,?,?)",
        )
        .bind(s.endpoint, owner, JSON.stringify(s))
        .run();
      return json({ ok: true });
    }
    if (!u) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
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
          : await db
              .prepare(
                `UPDATE orders SET ${field}=?,version=version+1 WHERE id=? AND version=?`,
              )
              .bind(value, b.id, b.version)
              .run();
      if (!changed.meta.changes)
        return json({ error: "ออเดอร์ถูกแก้ไขแล้ว กรุณาโหลดใหม่" }, 409);
      await log(u.id, b.action, String(b.id));
      if (value === "ready") {
        const { notifyOwner } = await import("@/lib/push");
        await notifyOwner(
          o.owner,
          "ออเดอร์ " + "OS-" + String(o.id).padStart(4, "0") + " พร้อมรับแล้ว",
          "รับเครื่องดื่มได้ที่เคาน์เตอร์ OLD SCHOOL",
        ).catch(() => 0);
      }
      return json({ ok: true });
    }
    if (b.action === "call") {
      const o = await db
        .prepare("SELECT * FROM orders WHERE id=? AND status='ready'")
        .bind(b.id)
        .first<any>();
      if (!o) return json({ error: "เรียกได้เฉพาะออเดอร์พร้อมรับ" }, 409);
      const recent = await db
        .prepare(
          "SELECT id FROM audit WHERE action='call' AND target=? AND created>?",
        )
        .bind(String(b.id), new Date(Date.now() - 30000).toISOString())
        .first();
      if (recent) return json({ error: "กรุณารอ 30 วินาทีก่อนเรียกซ้ำ" }, 429);
      const { notifyOwner } = await import("@/lib/push");
      const sent = await notifyOwner(
        o.owner,
        "เครื่องดื่มพร้อมรับแล้ว",
        "ออเดอร์ OS-" + String(o.id).padStart(4, "0") + " รับได้ที่เคาน์เตอร์",
      );
      await log(u.id, "call", String(b.id));
      return json({ ok: true, sent });
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
