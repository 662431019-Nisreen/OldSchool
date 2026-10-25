import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
const base = "http://localhost:5173";
const denied = await fetch(base + "/api/export");
assert.equal(denied.status, 403);
const login = await fetch(base + "/api/pos", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    action: "login",
    username: "owner",
    password: fs.readFileSync(".test-password", "utf8"),
  }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie").split(";")[0];
const response = await fetch(base + "/api/export", {
  headers: { Cookie: cookie },
});
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /spreadsheetml/);
const buf = Buffer.from(await response.arrayBuffer());
const book = XLSX.read(buf, { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(book.Sheets.Orders);
assert.ok(rows.length > 0);
assert.ok(book.Sheets.Revisions);
const revisions = XLSX.utils.sheet_to_json(book.Sheets.Revisions);
assert.ok(revisions.some((r) => r["ส่วนต่าง"] < 0));
assert.ok(rows.some((r) => r["ช่องทางสั่ง"] === "หน้าร้าน"));
assert.equal(rows[0]["ออเดอร์"].startsWith("OS-"), true);
const source = await fetch(base + "/api/pos?action=orders", {
  headers: { Cookie: cookie },
});
const { orders } = await source.json();
assert.ok(orders.some((o) => o.payment === "paid" && o.method === "cash"));
assert.ok(orders.some((o) => o.payment === "paid" && o.method === "qr"));
assert.ok(orders.some((o) => o.payment !== "paid"));
for (const o of orders) {
  const row = rows.find((r) => r["ออเดอร์"] === o.number);
  assert.ok(row);
  assert.equal(
    row["ชำระเงิน"],
    o.payment !== "paid"
      ? "ยังไม่ชำระ"
      : o.method === "cash"
        ? "เงินสด"
        : o.method === "qr"
          ? "โอน"
          : "ไม่ระบุวิธีชำระ",
  );
  assert.equal(
    row["สถานะชำระเงิน"],
    o.payment === "paid" ? "ชำระแล้ว" : "ยังไม่ชำระ",
  );
}
assert.ok(revisions.some((r) => r["วิธี"] === "เงินสด"));
assert.ok(revisions.some((r) => r["วิธี"] === "โอน"));

console.log(
  "PASS: Excel auth; valid XLSX; cash/transfer/unpaid labels match actual order payments; Thai correction payment methods.",
);
