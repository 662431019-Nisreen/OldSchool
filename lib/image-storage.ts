// Images are small immutable uploads in the same D1 Free database as the POS.
// The SQL migration enforces the total quota atomically, including concurrent uploads.
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_STORAGE_BYTES = 50 * 1024 * 1024;
export const IMAGE_STORAGE_QUOTA_ERROR = "image_storage_limit";

export function imageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((byte, i) => bytes[i] === byte))
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function storeImage(
  db: D1Database,
  key: string,
  mime: string,
  data: ArrayBuffer,
) {
  await db
    .prepare(
      "INSERT INTO uploaded_images (key, mime, data, bytes, created) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(key, mime, data, data.byteLength, Date.now())
    .run();
}

export async function readImage(db: D1Database, key: string) {
  const row = await db
    .prepare("SELECT mime, data, bytes FROM uploaded_images WHERE key = ?")
    .bind(key)
    .first<{ mime: string; data: number[] | ArrayBuffer; bytes: number }>();
  if (!row) return null;
  // D1 returns BLOBs as number arrays; local adapters may return ArrayBuffers.
  const data = new Uint8Array(
    row.data instanceof ArrayBuffer
      ? row.data
      : Uint8Array.from(row.data).buffer,
  );
  return { mime: row.mime, data, bytes: row.bytes };
}
