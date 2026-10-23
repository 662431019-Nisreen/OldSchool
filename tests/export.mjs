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
assert.equal(rows[0]["ออเดอร์"].startsWith("OS-"), true);
console.log(
  "PASS: Excel endpoint enforces admin auth and returns valid XLSX with Thai order rows.",
);
