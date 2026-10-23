import { env } from "cloudflare:workers";
import { user } from "@/lib/server";
export async function POST(r: Request) {
  if (r.headers.get("origin") !== new URL(r.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if ((await user(r))?.role !== "admin")
    return Response.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const form = await r.formData();
  const f = form.get("file");
  if (
    !(f instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
    f.size > 5 * 1024 * 1024
  )
    return Response.json(
      { error: "ใช้ JPG PNG หรือ WebP ขนาดไม่เกิน 5MB" },
      { status: 400 },
    );
  const key = crypto.randomUUID();
  await env.BUCKET!.put(key, await f.arrayBuffer(), {
    httpMetadata: { contentType: f.type },
  });
  return Response.json({ url: "/api/images/" + key });
}
