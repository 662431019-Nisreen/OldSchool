import { env } from "cloudflare:workers";
import { user } from "@/lib/server";
import {
  IMAGE_STORAGE_QUOTA_ERROR,
  MAX_IMAGE_BYTES,
  imageMime,
  storeImage,
} from "@/lib/image-storage";
export async function POST(r: Request) {
  if (r.headers.get("origin") !== new URL(r.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if ((await user(r))?.role !== "admin")
    return Response.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const limit = env.BUCKET ? 5 * 1024 * 1024 : MAX_IMAGE_BYTES;
  const message = env.BUCKET
    ? "ใช้ JPG PNG หรือ WebP ขนาดไม่เกิน 5MB"
    : "ใช้ JPG PNG หรือ WebP ขนาดไม่เกิน 1MB";
  // Reject an oversized multipart body before parsing it when a length is supplied.
  if (Number(r.headers.get("content-length")) > limit + 16 * 1024)
    return Response.json({ error: message }, { status: 413 });
  let form: FormData;
  try {
    form = await r.formData();
  } catch {
    return Response.json({ error: "อ่านไฟล์อัปโหลดไม่ได้" }, { status: 400 });
  }
  const f = form.get("file");
  if (
    !(f instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
    !f.size ||
    f.size > limit
  )
    return Response.json({ error: message }, { status: 400 });
  const data = await f.arrayBuffer();
  if (imageMime(new Uint8Array(data)) !== f.type)
    return Response.json(
      { error: "เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพ" },
      { status: 400 },
    );
  const key = crypto.randomUUID();
  if (env.BUCKET) {
    await env.BUCKET.put(key, data, { httpMetadata: { contentType: f.type } });
  } else {
    if (!env.DB)
      return Response.json(
        { error: "พื้นที่เก็บรูปภาพไม่พร้อมใช้งาน" },
        { status: 503 },
      );
    try {
      await storeImage(env.DB, key, f.type, data);
    } catch (error) {
      if (String(error).includes(IMAGE_STORAGE_QUOTA_ERROR))
        return Response.json(
          {
            error:
              "พื้นที่รูปภาพครบ 50MB แล้ว กรุณาติดต่อผู้ดูแลเพื่อจัดการรูปเก่า",
          },
          { status: 409 },
        );
      throw error;
    }
  }
  return Response.json({ url: "/api/images/" + key });
}
