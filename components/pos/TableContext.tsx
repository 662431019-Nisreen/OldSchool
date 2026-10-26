"use client";
import type { OrderContext } from "@/lib/order-context";

export default function TableContext({ table, type, maxTables, onChange }: {
  table: number; type: string; maxTables: number; onChange: (value: OrderContext) => void;
}) {
  const value = type === "takeaway" ? "takeaway" : table > 0 && table <= maxTables ? String(table) : "";
  return <section className="table-context" aria-label="โต๊ะสำหรับออเดอร์">
    <label htmlFor="order-table"><strong>รับเครื่องดื่มที่ไหน?</strong></label>
    <select id="order-table" value={value} required onChange={event => {
      const selected = event.target.value;
      if (selected) onChange(selected === "takeaway"
        ? { type: "takeaway", table: 0 }
        : { type: "dinein", table: Number(selected) });
    }}>
      <option value="" disabled>เลือกโต๊ะก่อนยืนยันสั่ง</option>
      {Array.from({ length: maxTables }, (_, index) => <option key={index + 1} value={index + 1}>โต๊ะ {index + 1}</option>)}
      <option value="takeaway">รับกลับบ้าน</option>
    </select>
    <small>{value ? "ตรวจสอบโต๊ะให้ถูกต้องก่อนยืนยันสั่ง" : "เลือกโต๊ะที่นั่ง หรือรับกลับบ้าน ไม่ต้องสแกน QR ซ้ำ"}</small>
  </section>;
}
