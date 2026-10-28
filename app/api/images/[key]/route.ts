import { env } from "cloudflare:workers";
import { readImage } from "@/lib/image-storage";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(key))
    return new Response("Not found", { status: 404 });
  const etag = `"${key}"`;
  const conditional = (response: Response) =>
    r.headers.get("if-none-match") === etag
      ? new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            "Cache-Control": "public,max-age=31536000,immutable",
          },
        })
      : response;
  const cacheKey = new Request(new URL(`/api/images/${key}`, r.url), {
    method: "GET",
  });
  // Immutable UUIDs can be shared safely; never cache private POS API responses.
  let cache: Cache | undefined;
  try {
    cache = await caches.open("old-school-images-v1");
    const cached = await cache.match(cacheKey);
    if (cached) return conditional(cached);
  } catch {
    console.error("image_cache_read_failed");
  }
  let body: BodyInit | null;
  let mime: string;
  if (env.BUCKET) {
    const obj = await env.BUCKET.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    body = obj.body;
    mime = obj.httpMetadata?.contentType || "image/jpeg";
  } else {
    if (!env.DB)
      return new Response("Image storage unavailable", { status: 503 });
    const image = await readImage(env.DB, key);
    if (!image) return new Response("Not found", { status: 404 });
    body = image.data;
    mime = image.mime;
  }
  const response = new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public,max-age=31536000,immutable",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
  try {
    await cache?.put(cacheKey, response.clone());
  } catch {
    // An unavailable edge cache must not prevent a successful database read.
    console.error("image_cache_write_failed");
  }
  return conditional(response);
}
