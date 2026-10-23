import { env } from "cloudflare:workers";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const obj = await env.BUCKET!.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public,max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
