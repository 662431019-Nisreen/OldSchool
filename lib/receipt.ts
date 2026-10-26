import { paymentSplit } from "./reports";

export type Receipt = {
  number: string;
  version: number;
  created: string;
  type: "dinein" | "takeaway";
  table: number | null;
  shop: { name: string; subtitle: string };
  items: {
    name: string;
    variantLabel: string;
    sweet: number | null;
    qty: number;
    price: number;
    note: string;
    unit: "cup" | "piece";
    lineTotal: number;
  }[];
  subtotal: number;
  adjustment: number;
  total: number;
  payments: { cash: number; qr: number; unknown: number };
  hasSettlements: boolean;
};

// A customer receipt uses the prices saved on the order, never today's menu.
// Pick each field explicitly so internal order and revision details stay private.
export function buildReceipt(order: any, shop: any): Receipt {
  if (order.payment !== "paid")
    throw new Error("กรุณายืนยันรับชำระเงินก่อนพิมพ์ใบเสร็จ");
  const invalid = () => {
    throw new Error("ข้อมูลใบเสร็จไม่สมบูรณ์ กรุณาตรวจสอบออเดอร์");
  };
  if (
    !Number.isSafeInteger(order.id) ||
    order.id < 1 ||
    !Number.isSafeInteger(order.version) ||
    order.version < 0 ||
    typeof order.created !== "string" ||
    !Number.isFinite(Date.parse(order.created)) ||
    !["dinein", "takeaway"].includes(order.type) ||
    (order.type === "dinein" &&
      (!Number.isSafeInteger(order.table) || order.table < 1)) ||
    !Array.isArray(order.items) ||
    !order.items.length
  )
    invalid();
  const items: Receipt["items"] = order.items.map((item: any) => {
    if (
      !item ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      !Number.isSafeInteger(item.qty) ||
      item.qty < 1 ||
      !Number.isSafeInteger(item.price) ||
      item.price < 0 ||
      !Number.isSafeInteger(item.price * item.qty) ||
      (item.sweet != null && !Number.isFinite(item.sweet))
    )
      invalid();
    return {
      name: item.name,
      variantLabel:
        typeof item.variantLabel === "string" ? item.variantLabel : "",
      sweet: item.sweet ?? null,
      qty: item.qty,
      price: item.price,
      note: typeof item.note === "string" ? item.note : "",
      unit: item.unit === "piece" ? "piece" : "cup",
      lineTotal: item.price * item.qty,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const adjustment = order.adjustment ?? 0;
  if (
    !Number.isSafeInteger(subtotal) ||
    !Number.isSafeInteger(adjustment) ||
    !Number.isSafeInteger(order.total) ||
    order.total < 0 ||
    subtotal + adjustment !== order.total ||
    (order.revisions != null && !Array.isArray(order.revisions))
  )
    invalid();
  const settlements = (order.revisions || []).filter((r: any) => r?.settlement);
  if (settlements.some((r: any) => !Number.isSafeInteger(r.settlement.amount)))
    invalid();
  const payments = paymentSplit(order);
  if (
    Object.values(payments).some((amount) => !Number.isSafeInteger(amount)) ||
    payments.cash + payments.qr + payments.unknown !== order.total
  )
    invalid();
  return {
    number: "OS-" + String(order.id).padStart(4, "0"),
    version: order.version,
    created: order.created,
    type: order.type,
    table: order.type === "dinein" ? order.table : null,
    shop: {
      name: typeof shop?.name === "string" ? shop.name : "OLD SCHOOL",
      subtitle: typeof shop?.subtitle === "string" ? shop.subtitle : "",
    },
    items,
    subtotal,
    adjustment,
    total: order.total,
    payments,
    hasSettlements: settlements.length > 0,
  };
}
