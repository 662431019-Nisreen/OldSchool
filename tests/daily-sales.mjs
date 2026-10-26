import assert from "node:assert/strict";
import { summarizeDailySales, summarizeSales } from "../lib/reports.ts";
import { readableItems } from "../lib/export-format.ts";
const items = [
  {
    name: "เอสเปรสโซ",
    variantLabel: "ร้อน",
    sweet: 25,
    qty: 2,
    price: 55,
    category: "กาแฟ",
    unit: "cup",
  },
];
const orders = [
  {
    created: "2026-10-25T16:59:59Z",
    payment: "paid",
    method: "cash",
    total: 100,
    adjustment: -10,
    items,
    revisions: [{ settlement: { method: "qr", amount: -10 } }],
  },
  { created: "2026-10-25T17:00:00Z", payment: "unpaid", total: 40, items: [] },
  {
    created: "2026-10-26T16:59:59Z",
    payment: "paid",
    method: "qr",
    total: 25,
    items: [
      { name: "เค้ก", qty: 1, price: 25, unit: "piece", category: "เบเกอรี่" },
    ],
  },
];
const days = summarizeDailySales(orders, {
  from: "2026-10-24",
  to: "2026-10-26",
});
assert.deepEqual(
  days.map((day) => day.date),
  ["2026-10-26", "2026-10-25", "2026-10-24"],
);
assert.equal(days[0].count, 2);
assert.equal(days[0].pending, 40);
assert.equal(days[0].sales, 25);
assert.equal(days[0].pieces, 1);
assert.equal(days[1].cash, 110);
assert.equal(days[1].qr, -10);
assert.equal(days[2].count, 0);
for (const field of [
  "sales",
  "cash",
  "qr",
  "unknown",
  "pending",
  "count",
  "cups",
  "pieces",
])
  assert.equal(
    days.reduce((n, day) => n + day[field], 0),
    summarizeSales(orders)[field],
  );
assert.equal(
  summarizeDailySales([], { from: "2024-02-01", to: "2024-02-29" }).length,
  29,
);
assert.equal(
  summarizeDailySales([], { from: "2026-10-26", to: "2026-10-26" })[0].sales,
  0,
);
assert.equal(
  summarizeDailySales([], { from: "2000-01-01", to: "9999-12-31" }).length,
  0,
);
assert.equal(summarizeDailySales(orders).length, 2);
const text = readableItems(items);
assert.match(text, /2 × เอสเปรสโซ/);
assert.match(text, /ร้อน/);
assert.match(text, /หวาน 25%/);
assert.match(text, /รวม 110 บาท/);
assert(!text.includes("productId"));
assert(
  !readableItems([
    { name: "เค้ก", sweet: null, unit: "piece", qty: 1, price: 25 },
  ]).includes("หวาน"),
);
console.log(
  "PASS: daily Bangkok boundaries, empty days, leap month, bounded ranges, cash/refund reconciliation, and readable revision items",
);
