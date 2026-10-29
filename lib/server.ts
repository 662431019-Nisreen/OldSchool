import { env } from "cloudflare:workers";
import {
  initialProducts,
  variants,
  sweets,
  Product,
  categories,
} from "./catalog";
export const DB = () => {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
};
export const cookie = (r: Request, k: string) =>
  r.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(k + "="))
    ?.slice(k.length + 1);
export async function getConfig() {
  const row = await DB()
    .prepare("SELECT value FROM config WHERE key=?")
    .bind("shop")
    .first<{ value: string }>();
  if (row) {
    const config = JSON.parse(row.value);
    return { ...config, revision: config.revision ?? "legacy" };
  }
  return {
    revision: "initial",
    name: "OLD SCHOOL",
    subtitle: "Coffee & Good Days",
    open: "08:00",
    close: "18:00",
    tables: 12,
    categories: categories.slice(1),
    products: initialProducts,
    bankQr: "",
    logo: "/assets/logo-coral.png",
    cover: "/assets/hero.jpg",
    accepting: true,
  };
}
export async function hash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function user(r: Request) {
  const sid = cookie(r, "os_session");
  if (!sid) return null;
  return DB()
    .prepare(
      "SELECT users.id,users.name,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires>? AND users.active=1",
    )
    .bind(sid, Date.now())
    .first<{ id: string; name: string; role: string }>();
}
export function validateCart(lines: any[], products: Product[]) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 60)
    throw new Error("กรุณาตรวจสอบตะกร้า");
  return lines.map((line) => {
    const p = products.find((x) => x.id === line.productId && !x.hidden);
    if (!p) throw new Error("เมนูนี้ยังไม่พร้อมขาย");
    if (p.soldOut) throw new Error(p.name + " สินค้าหมดชั่วคราว");
    const v = variants(p).find((x) => x.id === line.variant);
    if (
      !v ||
      !Number.isInteger(line.qty) ||
      line.qty < 1 ||
      line.qty > 30 ||
      (p.sweet !== false && !(p.sweetLevels || sweets).includes(line.sweet))
    )
      throw new Error("ตัวเลือกสินค้าไม่ถูกต้อง");
    return {
      productId: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit || (p.price != null ? "piece" : "cup"),
      variant: v.id,
      variantLabel: v.label,
      sweet: p.sweet === false ? null : line.sweet,
      qty: line.qty,
      price: v.price,
      note: String(line.note || "").slice(0, 200),
    };
  });
}
export async function log(actor: string, action: string, target: string) {
  await DB()
    .prepare("INSERT INTO audit(actor,action,target,created) VALUES(?,?,?,?)")
    .bind(actor, action, target, new Date().toISOString())
    .run();
}
export function unpack(o: any) {
  const payload = JSON.parse(o.payload);
  return {
    ...o,
    ...payload,
    number: "OS-" + String(payload.queueNumber ?? o.id).padStart(4, "0"),
    owner: undefined,
    idem: undefined,
    payload: undefined,
  };
}

export function publicOrder(row: any) {
  const o = unpack(row);
  delete o.revisions;
  delete o.createdBy;
  delete o.adjustmentReason;
  return o;
}
