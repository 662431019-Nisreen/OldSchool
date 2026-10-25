import { DB, unpack } from "./server";
import { reportRange } from "./reports";
export async function reportOrders(params: URLSearchParams) {
  const range = reportRange(params);
  const query = range.from
    ? DB()
        .prepare(
          "SELECT * FROM orders WHERE created>=? AND created<? ORDER BY id DESC LIMIT 10001",
        )
        .bind(range.startUtc, range.endUtc)
    : DB().prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 10001");
  const result = await query.all();
  if (result.results.length > 10000)
    throw new Error("ข้อมูลเกิน 10,000 ออเดอร์ กรุณาเลือกช่วงวันที่สั้นลง");
  return { range, orders: result.results.map(unpack) };
}
