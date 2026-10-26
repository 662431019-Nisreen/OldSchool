// Standards-only Web Push: RFC 8291 aes128gcm and RFC 8292 VAPID.
export type PushKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};
export type DeviceSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};
export const encode64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export function decode64(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(value))
    throw new Error("invalid_base64url");
  value = value.replace(/=+$/, "");
  return Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
}
export function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      !u.hash &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function validateSubscription(
  value: any,
): Promise<DeviceSubscription> {
  if (
    !value ||
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 2048 ||
    !allowedEndpoint(value.endpoint)
  )
    throw new Error("ปลายทางแจ้งเตือนไม่รองรับ");
  const pub = decode64(value.keys?.p256dh),
    auth = decode64(value.keys?.auth);
  if (pub.length !== 65 || pub[0] !== 4 || auth.length !== 16)
    throw new Error("ข้อมูลอุปกรณ์ไม่ถูกต้อง");
  await crypto.subtle.importKey(
    "raw",
    pub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  if (
    value.expirationTime != null &&
    (!Number.isFinite(value.expirationTime) ||
      value.expirationTime <= Date.now())
  )
    throw new Error("ข้อมูลอุปกรณ์หมดอายุ กรุณาเปิดแจ้งเตือนใหม่");
  return {
    endpoint: value.endpoint,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    expirationTime: value.expirationTime ?? null,
  };
}
const text = new TextEncoder();
const join = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    bytes.set(p, pos);
    pos += p.length;
  }
  return bytes;
};
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(ikm),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(salt),
        info: new Uint8Array(info),
      },
      key,
      length * 8,
    ),
  );
}
export async function encryptPush(
  subscription: DeviceSubscription,
  payload: string,
) {
  const content = text.encode(payload);
  if (content.length > 3000) throw new Error("push_payload_too_large");
  const receiver = decode64(subscription.keys.p256dh),
    auth = decode64(subscription.keys.auth);
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sender = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiver,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverKey },
      ephemeral.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    shared,
    auth,
    join(text.encode("WebPush: info\0"), receiver, sender),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    ikm,
    salt,
    text.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    ikm,
    salt,
    text.encode("Content-Encoding: nonce\0"),
    12,
  );
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      join(content, new Uint8Array([2])),
    ),
  );
  // One final record, size 4096, 65-byte ephemeral uncompressed P-256 key.
  return join(salt, new Uint8Array([0, 0, 16, 0, 65]), sender, encrypted);
}
async function vapidPrivate(keys: PushKeys) {
  const pub = decode64(keys.publicKey);
  if (
    pub.length !== 65 ||
    pub[0] !== 4 ||
    decode64(keys.privateKey).length !== 32 ||
    !/^(mailto:|https:\/\/)/.test(keys.subject)
  )
    throw new Error("invalid_vapid_configuration");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: encode64(pub.slice(1, 33)),
      y: encode64(pub.slice(33)),
      d: keys.privateKey,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}
export async function validatePushKeys(keys: PushKeys) {
  const key = await vapidPrivate(keys),
    data = text.encode("Old School Coffee Web Push configuration");
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    data,
  );
  const pub = await crypto.subtle.importKey(
    "raw",
    decode64(keys.publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      signature,
      data,
    ))
  )
    throw new Error("vapid_key_mismatch");
}
export async function pushRequest(
  subscription: DeviceSubscription,
  payload: any,
  keys: PushKeys,
) {
  if (!allowedEndpoint(subscription.endpoint))
    throw new Error("blocked_endpoint");
  const key = await vapidPrivate(keys);
  const jwt =
    encode64(text.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))) +
    "." +
    encode64(
      text.encode(
        JSON.stringify({
          aud: new URL(subscription.endpoint).origin,
          exp: Math.floor(Date.now() / 1000) + 3600,
          sub: keys.subject,
        }),
      ),
    );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      text.encode(jwt),
    ),
  );
  return {
    body: await encryptPush(subscription, JSON.stringify(payload)),
    headers: {
      Authorization: `vapid t=${jwt}.${encode64(sig)}, k=${keys.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "high",
    },
  };
}
