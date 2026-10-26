const manifest = {
  name: "Old School Coffee",
  short_name: "Old School",
  lang: "th",
  start_url: "/",
  display: "standalone",
  background_color: "#faf7f0",
  theme_color: "#64421e",
  icons: [
    {
      src: "/assets/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/assets/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
  id: "/",
  scope: "/",
  description: "สั่งเครื่องดื่มและติดตามออเดอร์ Old School Coffee",
  orientation: "any",
  categories: ["food", "shopping"],
};
// Preserve the scanned table/takeaway context when adding this page to the home screen.
export async function GET(r: Request) {
  const params = new URL(r.url).searchParams;
  const table = Number(params.get("table"));
  const start =
    params.get("type") === "takeaway"
      ? "/?type=takeaway"
      : Number.isInteger(table) && table >= 1 && table <= 100
        ? "/?table=" + table
        : "/";
  const workspace = params.get("workspace") === "1";
  return Response.json(
    workspace
      ? {
          ...manifest,
          id: "/admin",
          name: "Old School ร้าน",
          short_name: "Old School ร้าน",
          start_url: "/admin",
          description: "รับออเดอร์และจัดการร้าน Old School Coffee",
        }
      : { ...manifest, start_url: start },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "no-store",
      },
    },
  );
}
