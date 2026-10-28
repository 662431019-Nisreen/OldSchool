import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  imageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_STORAGE_BYTES,
  storeImage,
  readImage,
} from "../lib/image-storage.ts";

assert.equal(imageMime(Uint8Array.from([0xff, 0xd8, 0xff])), "image/jpeg");
assert.equal(
  imageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])),
  "image/png",
);
assert.equal(imageMime(new TextEncoder().encode("RIFF1234WEBP")), "image/webp");
for (const invalid of [
  "",
  "<svg/onload=alert(1)>",
  "RIFF1234JPEG",
  "plain text",
])
  assert.equal(imageMime(new TextEncoder().encode(invalid)), null);

const sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
  .filter((name) => name.endsWith(".sql"))
  .sort())
  sqlite.exec(
    readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"),
  );

const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let bindings = [];
    return {
      bind(...values) {
        bindings = values.map((value) =>
          value instanceof ArrayBuffer ? new Uint8Array(value) : value,
        );
        return this;
      },
      async run() {
        return statement.run(...bindings);
      },
      async first() {
        return statement.get(...bindings) ?? null;
      },
    };
  },
};
const used = () =>
  sqlite.prepare("SELECT bytes FROM image_storage WHERE id=1").get().bytes;
const image = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
await storeImage(db, "round-trip", "image/jpeg", image.buffer);
assert.deepEqual((await readImage(db, "round-trip")).data, image);
assert.equal(used(), image.byteLength);
assert.equal(await readImage(db, "missing"), null);
await assert.rejects(
  storeImage(db, "round-trip", "image/jpeg", image.buffer),
  /UNIQUE/,
);
assert.equal(used(), image.byteLength, "failed inserts must not consume quota");
assert.throws(
  () =>
    sqlite
      .prepare(
        "UPDATE uploaded_images SET mime='image/png' WHERE key='round-trip'",
      )
      .run(),
  /image_storage_immutable/,
);
sqlite.prepare("DELETE FROM uploaded_images WHERE key='round-trip'").run();
assert.equal(used(), 0, "deleting a stored image releases its quota");
await assert.rejects(
  storeImage(db, "empty", "image/png", new ArrayBuffer(0)),
  /image_storage_invalid/,
);
await assert.rejects(
  storeImage(db, "too-big", "image/png", new ArrayBuffer(MAX_IMAGE_BYTES + 1)),
  /image_storage_invalid/,
);
await assert.rejects(
  storeImage(db, "svg", "image/svg+xml", image.buffer),
  /image_storage_invalid/,
);
const insert = sqlite.prepare(
  "INSERT INTO uploaded_images VALUES (?, 'image/png', ?, ?, 0)",
);
assert.throws(
  () => insert.run("wrong-size", image, 100),
  /image_storage_invalid/,
);
const full = new Uint8Array(MAX_IMAGE_BYTES);
for (let i = 0; i < MAX_IMAGE_STORAGE_BYTES / MAX_IMAGE_BYTES; i++)
  await storeImage(db, `quota-${i}`, "image/png", full.buffer);
assert.equal(used(), MAX_IMAGE_STORAGE_BYTES);
await assert.rejects(
  storeImage(db, "quota-overflow", "image/jpeg", image.buffer),
  /image_storage_limit/,
);
assert.equal(
  used(),
  MAX_IMAGE_STORAGE_BYTES,
  "quota rejection rolls back atomically",
);
sqlite.prepare("DELETE FROM uploaded_images WHERE key='quota-0'").run();
await storeImage(db, "after-delete", "image/jpeg", image.buffer);
assert.equal(
  used(),
  MAX_IMAGE_STORAGE_BYTES - MAX_IMAGE_BYTES + image.byteLength,
);
sqlite.exec("DELETE FROM image_storage WHERE id=1");
await assert.rejects(
  storeImage(db, "missing-quota", "image/jpeg", image.buffer),
  /image_storage_limit/,
);
sqlite.close();
console.log(
  "PASS: file signatures, binary round-trip, atomic image quota, rollback, immutable URLs, deletion, and fail-closed quota metadata",
);
