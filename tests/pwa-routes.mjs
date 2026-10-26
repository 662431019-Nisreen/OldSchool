import assert from "node:assert/strict";
const base = "http://localhost:5173";
for (const [query, url] of [
  ["table=2", "/?table=2"],
  ["type=takeaway", "/?type=takeaway"],
  ["table=999", "/"],
  ["", "/"],
]) {
  const r = await fetch(base + "/api/manifest?" + query);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /manifest\+json/);
  const d = await r.json();
  assert.equal(d.name, "Old School Coffee");
  assert.equal(d.start_url, url);
  assert.equal(d.id, "/");
  assert.equal(d.scope, "/");
}
const staffManifest = await (
  await fetch(base + "/api/manifest?workspace=1")
).json();
assert.equal(staffManifest.id, "/admin");
assert.equal(staffManifest.start_url, "/admin");
assert.equal(staffManifest.name, "Old School ร้าน");
const adminHtml = await (await fetch(base + "/admin")).text();
assert.match(adminHtml, /manifest[^>]*workspace=1/);
assert.match(adminHtml, /Old School ร้าน/);
const key = await (await fetch(base + "/api/pos?action=push-key")).json();
assert.equal(key.configured, true);
assert.equal(typeof key.key, "string");
assert.deepEqual(Object.keys(key).sort(), ["configured", "key"]);
const html = await (await fetch(base + "/")).text();
assert.match(html, /apple-mobile-web-app-title/);
assert.match(html, /Old School Coffee/);
assert.match(html, /theme-color/);
assert.equal((await fetch(base + "/offline.html")).status, 200);
assert.equal((await fetch(base + "/sw.js")).status, 200);
console.log(
  "PASS: QR-context manifest start URL; stable install ID; Apple app metadata; offline/SW resources; actual local VAPID pair configured with no private key exposed.",
);
