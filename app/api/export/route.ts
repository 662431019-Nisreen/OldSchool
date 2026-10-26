import { user } from "@/lib/server";
import { reportOrders } from "@/lib/report-server";
import {
  paymentSplit,
  summarizeSales,
  summarizeDailySales,
} from "@/lib/reports";
import XLSX from "xlsx-js-style";
import { readableItems, itemOptions, exportDate } from "@/lib/export-format";
import { exportSheet } from "@/lib/export-sheet";
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
    วันที่: exportDate(o.created),
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
  const daily = summarizeDailySales(orders, range).map((day) => ({
    วันที่: day.date,
    จำนวนออเดอร์: day.count,
    ออเดอร์ชำระแล้ว: day.paidOrders,
    จำนวนแก้ว: day.cups,
    จำนวนชิ้น: day.pieces,
    เงินสดสุทธิ: day.cash,
    โอนสุทธิ: day.qr,
    ไม่ระบุวิธีชำระ: day.unknown,
    ยอดรับชำระสุทธิ: day.sales,
    ยอดรอชำระ: day.pending,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    exportSheet(daily, [
      "วันที่",
      "จำนวนออเดอร์",
      "ออเดอร์ชำระแล้ว",
      "จำนวนแก้ว",
      "จำนวนชิ้น",
      "เงินสดสุทธิ",
      "โอนสุทธิ",
      "ไม่ระบุวิธีชำระ",
      "ยอดรับชำระสุทธิ",
      "ยอดรอชำระ",
    ]),
    "DailySummary",
  );
  XLSX.utils.book_append_sheet(
    wb,
    exportSheet(rows, [
      "ออเดอร์",
      "วันที่",
      "ประเภท",
      "โต๊ะ",
      "ยอดรวม",
      "ยอดก่อนปรับ",
      "ปรับยอด",
      "เหตุผลปรับยอด",
      "ช่องทางสั่ง",
      "จำนวนครั้งที่แก้ไข",
      "สถานะ",
      "ชำระเงิน",
      "เงินสดสุทธิ",
      "โอนสุทธิ",
      "ไม่ระบุวิธีชำระสุทธิ",
      "สถานะชำระเงิน",
      "จำนวนแก้ว",
      "จำนวนชิ้น",
    ]),
    "Orders",
  );
  const revisions = orders.flatMap((o) =>
    (o.revisions || []).map((r: any) => ({
      ออเดอร์: o.number,
      เวลา: exportDate(r.at),
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
      รายการก่อนแก้: readableItems(r.before.items),
      รายการหลังแก้: readableItems(r.after.items),
    })),
  );
  XLSX.utils.book_append_sheet(
    wb,
    exportSheet(revisions, [
      "ออเดอร์",
      "เวลา",
      "ผู้แก้ไข",
      "เหตุผล",
      "ยอดเดิม",
      "ยอดใหม่",
      "ส่วนต่าง",
      "การชำระส่วนต่าง",
      "วิธี",
      "รายการก่อนแก้",
      "รายการหลังแก้",
    ]),
    "Revisions",
  );
  // One row per item keeps even large order revisions fully readable, without tall-cell limits.
  const revisionItems = orders.flatMap((o) =>
    (o.revisions || []).flatMap((revision: any, index: number) =>
      ["before", "after"].flatMap((stage) =>
        (revision[stage].items || []).map((item: any) => ({
          ออเดอร์: o.number,
          ครั้งที่แก้: index + 1,
          เวลา: exportDate(revision.at),
          รายการ: stage === "before" ? "ก่อนแก้" : "หลังแก้",
          เมนู: item.name,
          ตัวเลือก: itemOptions(item),
          จำนวน: item.qty,
          หน่วย: item.unit === "piece" ? "ชิ้น" : "แก้ว",
          ราคาต่อหน่วย: item.price,
          รวม: item.qty * item.price,
          หมายเหตุ: item.note || "",
        })),
      ),
    ),
  );
  XLSX.utils.book_append_sheet(
    wb,
    exportSheet(revisionItems, [
      "ออเดอร์",
      "ครั้งที่แก้",
      "เวลา",
      "รายการ",
      "เมนู",
      "ตัวเลือก",
      "จำนวน",
      "หน่วย",
      "ราคาต่อหน่วย",
      "รวม",
      "หมายเหตุ",
    ]),
    "RevisionItems",
  );
  const summary = summarizeSales(orders);
  XLSX.utils.book_append_sheet(
    wb,
    exportSheet(
      [
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
      ],
      [
        "เริ่มวันที่",
        "ถึงวันที่",
        "ยอดรับชำระสุทธิ",
        "เงินสดสุทธิ",
        "โอนสุทธิ",
        "ไม่ระบุวิธีชำระ",
        "ยอดรอชำระ",
        "จำนวนออเดอร์",
        "ออเดอร์ชำระแล้ว",
        "จำนวนแก้วชำระแล้ว",
        "จำนวนชิ้นชำระแล้ว",
        "ปรับยอด",
      ],
    ),
    "Summary",
  );
  const data = XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  });
  const filename =
    "OLD-SCHOOL-sales-" +
    (params.get("date")
      ? "day-" + params.get("date")
      : params.get("month")
        ? "month-" + params.get("month")
        : range.from
          ? range.from + "-to-" + range.to
          : "all") +
    ".xlsx";
  return new Response(data, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private,no-store",
    },
  });
}
