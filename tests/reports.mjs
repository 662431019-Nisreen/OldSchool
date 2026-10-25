import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  reportRange,
  bangkokDay,
  paymentSplit,
  summarizeSales,
} from "../lib/reports.ts";
assert.equal(bangkokDay("2026-10-25T17:00:00.000Z"), "2026-10-26");
assert.deepEqual(reportRange(new URLSearchParams({ date: "2026-10-26" })), {
  from: "2026-10-26",
  to: "2026-10-26",
  startUtc: "2026-10-25T17:00:00.000Z",
  endUtc: "2026-10-26T17:00:00.000Z",
});
assert.equal(
  reportRange(new URLSearchParams({ month: "2024-02" })).to,
  "2024-02-29",
);
assert.equal(
  reportRange(new URLSearchParams({ start: "2026-10-01", end: "2026-10-31" }))
    .endUtc,
  "2026-10-31T17:00:00.000Z",
);
for (const bad of [
  { date: "2026-02-30" },
  { month: "2026-13" },
  { start: "2026-10-02", end: "2026-10-01" },
  { start: "2026-10-01" },
  { date: "2026-10-01", month: "2026-10" },
])
  assert.throws(() => reportRange(new URLSearchParams(bad)));
const corrected = {
  total: 90,
  payment: "paid",
  method: "cash",
  items: [{ category: "กาแฟ", price: 50, qty: 2 }],
  adjustment: -10,
  revisions: [{ settlement: { amount: -10, method: "qr" } }],
};
assert.deepEqual(paymentSplit(corrected), { cash: 100, qr: -10, unknown: 0 });
const summary = summarizeSales([
  corrected,
  { total: 30, payment: "unpaid", items: [] },
  {
    total: 40,
    payment: "paid",
    method: "qr",
    items: [{ category: "เบเกอรี่", price: 40, qty: 1, unit: "piece" }],
  },
]);
assert.equal(summary.sales, 130);
assert.equal(summary.cash, 100);
assert.equal(summary.qr, 30);
assert.equal(summary.pending, 30);
assert.equal(summary.cups, 2);
assert.equal(summary.pieces, 1);
assert.equal(summary.subtotal + summary.adjustment, summary.sales);
const base = "http://localhost:5173";
assert.equal((await fetch(base + "/api/pos?action=report")).status, 403);
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
const today = bangkokDay(),
  month = today.slice(0, 7);
for (const query of [
  "date=" + today,
  "month=" + month,
  "start=" + month + "-01&end=" + today,
  "",
  "date=2000-01-01",
]) {
  const response = await fetch(base + "/api/pos?action=report&" + query, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.summary, summarizeSales(data.orders));
  for (const o of data.orders) {
    const day = bangkokDay(o.created);
    if (data.range.from) assert(day >= data.range.from && day <= data.range.to);
  }
  assert.equal(
    data.summary.cash + data.summary.qr + data.summary.unknown,
    data.summary.sales,
  );
  const exported = await fetch(base + "/api/export?" + query, {
    headers: { Cookie: cookie },
  });
  assert.equal(exported.status, 200);
  const book = XLSX.read(Buffer.from(await exported.arrayBuffer()), {
    type: "buffer",
  });
  const rows = XLSX.utils.sheet_to_json(book.Sheets.Orders);
  assert.deepEqual(
    rows.map((r) => r["ออเดอร์"]),
    data.orders.map((o) => o.number),
  );
  const sums = XLSX.utils.sheet_to_json(book.Sheets.Summary)[0];
  assert.equal(sums["ยอดรับชำระสุทธิ"], data.summary.sales);
  assert.equal(sums["เงินสดสุทธิ"], data.summary.cash);
  assert.equal(sums["โอนสุทธิ"], data.summary.qr);
  assert.equal(sums["ยอดรอชำระ"], data.summary.pending);
  if (query === "date=2000-01-01") assert.equal(data.orders.length, 0);
}
for (const query of [
  "start=2026-10-26&end=2026-10-01",
  "date=2026-02-30",
  "date=2026-10-26&month=2026-10",
]) {
  assert.equal(
    (
      await fetch(base + "/api/pos?action=report&" + query, {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/export?" + query, {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
}
console.log(
  "PASS: Bangkok date boundaries; valid ranges/leap year; cross-channel refunds; paid vs pending; bakery units; admin-only reports; day/month/range/all/empty filters; Excel rows and summary match website.",
);
