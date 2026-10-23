import { env } from "cloudflare:workers";
import { DB } from "./server";
const b64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const decode = (s: string) =>
  Uint8Array.from(
    atob(
      s.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (s.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
export async function notifyOwner(
  owner: string,
  _title: string,
  _body: string,
) {
  const e = env as any;
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return 0;
  const pub = decode(e.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: b64(pub.slice(1, 33)),
      y: b64(pub.slice(33)),
      d: e.VAPID_PRIVATE_KEY,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const rows = await DB()
    .prepare("SELECT id,value FROM subscriptions WHERE owner=?")
    .bind(owner)
    .all<any>();
  let sent = 0;
  for (const row of rows.results) {
    try {
      const s = JSON.parse(row.value);
      const origin = new URL(s.endpoint).origin;
      const allowed =
        origin === "https://fcm.googleapis.com" ||
        origin === "https://updates.push.services.mozilla.com" ||
        new URL(s.endpoint).hostname.endsWith(".push.apple.com") ||
        new URL(s.endpoint).hostname.endsWith(".notify.windows.com");
      if (!allowed) continue;
      const enc = new TextEncoder();
      const body =
        b64(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))) +
        "." +
        b64(
          enc.encode(
            JSON.stringify({
              aud: origin,
              exp: Math.floor(Date.now() / 1000) + 3600,
              sub:
                e.VAPID_SUBJECT ||
                "https://old-school-coffee.asdareen112001.chatgpt.site",
            }),
          ),
        );
      const sig = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        enc.encode(body),
      );
      const response = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${body}.${b64(new Uint8Array(sig))}, k=${e.VAPID_PUBLIC_KEY}`,
          TTL: "120",
          Urgency: "high",
        },
      });
      if (response.ok) sent++;
      if (response.status === 410 || response.status === 404)
        await DB()
          .prepare("DELETE FROM subscriptions WHERE id=?")
          .bind(row.id)
          .run();
    } catch {}
  }
  return sent;
}
