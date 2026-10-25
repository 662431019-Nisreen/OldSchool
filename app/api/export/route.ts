import { user } from "@/lib/server";
import { reportOrders } from "@/lib/report-server";
import { paymentSplit, summarizeSales } from "@/lib/reports";
import * as XLSX from "xlsx";
export async function GET(r: Request) {
  if ((await user(r))?.role !== "admin")
    return Response.json({ error: "เฉพาะผู้ดูแลระบบ" }, { status: 403 });
  const params = new URL(r.url).searchParams;
  let orders: any[], range: any;
  try {
    ({ orders, range } = await reportOrders(params));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  const names: Record<string, string> = {
    waiting: "รอทำ",
    making: "กำลังทำ",
    ready: "พร้อมรับ",
    done: "เสร็จสิ้น",
  };
  const rows = orders.map((o) => ({
    ออเดอร์: o.number,
    วันที่: new Date(o.created).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
    }),
    ประเภท: o.type === "dinein" ? "ทานที่ร้าน" : "กลับบ้าน",
    โต๊ะ: o.table || "",
    ยอดรวม: o.total,
    ยอดก่อนปรับ: o.items.reduce((s: number, i: any) => s + i.price * i.qty, 0),
    ปรับยอด: o.adjustment || 0,
    เหตุผลปรับยอด: o.adjustmentReason || "",
    ช่องทางสั่ง: o.source === "counter" ? "หน้าร้าน" : "QR",
    จำนวนครั้งที่แก้ไข: o.revisions?.length || 0,
    สถานะ: names[o.status],
    ชำระเงิน:
      o.payment !== "paid"
        ? "ยังไม่ชำระ"
        : o.method === "cash"
          ? "เงินสด"
          : o.method === "qr"
            ? "โอน"
            : "ไม่ระบุวิธีชำระ",
    เงินสดสุทธิ: paymentSplit(o).cash,
    โอนสุทธิ: paymentSplit(o).qr,
    ไม่ระบุวิธีชำระสุทธิ: paymentSplit(o).unknown,
    สถานะชำระเงิน: o.payment === "paid" ? "ชำระแล้ว" : "ยังไม่ชำระ",
    จำนวนแก้ว: o.items.reduce(
      (s: number, i: any) => s + (i.unit === "piece" ? 0 : i.qty),
      0,
    ),
    จำนวนชิ้น: o.items.reduce(
      (s: number, i: any) => s + (i.unit === "piece" ? i.qty : 0),
      0,
    ),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Orders");
  const revisions = orders.flatMap((o) =>
    (o.revisions || []).map((r: any) => ({
      ออเดอร์: o.number,
      เวลา: r.at,
      ผู้แก้ไข: r.actor,
      เหตุผล: r.reason,
      ยอดเดิม: r.before.total,
      ยอดใหม่: r.after.total,
      ส่วนต่าง: r.delta,
      การชำระส่วนต่าง: r.settlement
        ? r.delta < 0
          ? "คืนเงิน"
          : "รับเพิ่ม"
        : "ยังไม่ชำระ / ยอดเท่าเดิม",
      วิธี:
        r.settlement?.method === "cash"
          ? "เงินสด"
          : r.settlement?.method === "qr"
            ? "โอน"
            : "",
      รายการก่อนแก้: JSON.stringify(r.before.items),
      รายการหลังแก้: JSON.stringify(r.after.items),
    })),
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(revisions),
    "Revisions",
  );
  const summary = summarizeSales(orders);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        เริ่มวันที่: range.from || "ทั้งหมด",
        ถึงวันที่: range.to || "ทั้งหมด",
        ยอดรับชำระสุทธิ: summary.sales,
        เงินสดสุทธิ: summary.cash,
        โอนสุทธิ: summary.qr,
        ไม่ระบุวิธีชำระ: summary.unknown,
        ยอดรอชำระ: summary.pending,
        จำนวนออเดอร์: summary.count,
        ออเดอร์ชำระแล้ว: summary.paidOrders,
        จำนวนแก้วชำระแล้ว: summary.cups,
        จำนวนชิ้นชำระแล้ว: summary.pieces,
        ปรับยอด: summary.adjustment,
      },
    ]),
    "Summary",
  );
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Response(data, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="OLD-SCHOOL-sales.xlsx"',
      "Cache-Control": "private,no-store",
    },
  });
}
