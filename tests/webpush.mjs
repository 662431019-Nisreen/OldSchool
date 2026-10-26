import assert from "node:assert/strict";
import {
  createECDH,
  randomBytes,
  hkdfSync,
  createDecipheriv,
  createPublicKey,
  verify,
  generateKeyPairSync,
} from "node:crypto";
import {
  encryptPush,
  pushRequest,
  validatePushKeys,
  validateSubscription,
  allowedEndpoint,
} from "../lib/webpush.ts";
const user = createECDH("prime256v1");
const pub = user.generateKeys(),
  auth = randomBytes(16);
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/unit-test",
  keys: { p256dh: pub.toString("base64url"), auth: auth.toString("base64url") },
};
await validateSubscription(subscription);
for (const endpoint of [
  "http://fcm.googleapis.com/a",
  "https://localhost/a",
  "https://fcm.googleapis.com.evil.test/a",
  "https://user@fcm.googleapis.com/a",
  "https://fcm.googleapis.com:444/a",
  "https://evilpush.apple.com/a",
])
  assert.equal(allowedEndpoint(endpoint), false);
for (const endpoint of [
  "https://web.push.apple.com/a",
  "https://updates.push.services.mozilla.com/a",
  "https://wns2.notify.windows.com/a",
])
  assert.equal(allowedEndpoint(endpoint), true);
await assert.rejects(() =>
  validateSubscription({
    ...subscription,
    keys: { p256dh: "AAAA", auth: "AAA" },
  }),
);
function decrypt(body) {
  const b = Buffer.from(body),
    salt = b.subarray(0, 16),
    server = b.subarray(21, 86);
  assert.equal(b.readUInt32BE(16), 4096);
  assert.equal(b[20], 65);
  const shared = user.computeSecret(server);
  const ikm = hkdfSync(
    "sha256",
    shared,
    auth,
    Buffer.concat([Buffer.from("WebPush: info\0"), pub, server]),
    32,
  );
  const cek = hkdfSync(
    "sha256",
    ikm,
    salt,
    Buffer.from("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = hkdfSync(
    "sha256",
    ikm,
    salt,
    Buffer.from("Content-Encoding: nonce\0"),
    12,
  );
  const content = b.subarray(86);
  const dec = createDecipheriv(
    "aes-128-gcm",
    Buffer.from(cek),
    Buffer.from(nonce),
  );
  dec.setAuthTag(content.subarray(-16));
  const plain = Buffer.concat([
    dec.update(content.subarray(0, -16)),
    dec.final(),
  ]);
  assert.equal(plain.at(-1), 2);
  return plain.subarray(0, -1).toString();
}
const message = {
  title: "☕ Old School Coffee",
  body: "เครื่องดื่มของคุณพร้อมแล้ว!",
  data: { url: "/?view=orders#order=" + crypto.randomUUID() },
};
assert.deepEqual(
  JSON.parse(decrypt(await encryptPush(subscription, JSON.stringify(message)))),
  message,
);
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
  jwk = pair.privateKey.export({ format: "jwk" }),
  vapidPub = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
const keys = {
  publicKey: vapidPub,
  privateKey: jwk.d,
  subject: "https://old-school-coffee.asdareen112001.chatgpt.site",
};
await validatePushKeys(keys);
const request = await pushRequest(subscription, message, keys);
assert.equal(request.headers["Content-Encoding"], "aes128gcm");
assert.deepEqual(JSON.parse(decrypt(request.body)), message);
const jwt = request.headers.Authorization.match(/vapid t=([^,]+)/)[1],
  parts = jwt.split(".");
assert(
  verify(
    "sha256",
    Buffer.from(parts[0] + "." + parts[1]),
    { key: createPublicKey(pair.privateKey), dsaEncoding: "ieee-p1363" },
    Buffer.from(parts[2], "base64url"),
  ),
);
assert.equal(
  JSON.parse(Buffer.from(parts[1], "base64url")).aud,
  "https://fcm.googleapis.com",
);
console.log(
  "PASS: independently decrypted AES-128-GCM payload; VAPID signature verification; endpoint SSRF restrictions; validated browser subscription keys.",
);
