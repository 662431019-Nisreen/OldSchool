import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "oldschool-initial-loading-"));
const originalFetch = globalThis.fetch;
let requests = 0;
try {
  // Bundle the renderer and App together so both use the same React instance.
  await build({
    stdin: {
      contents: `
        import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import App from "./app/page.tsx";
        import { initialProducts } from "./lib/catalog.ts";
        export function renderInitial() {
          return renderToStaticMarkup(createElement(App));
        }
        export const sampleNames = initialProducts.map(product => product.name);
      `,
      resolveDir: root,
      sourcefile: "initial-loading-entry.tsx",
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: join(temp, "initial-render.cjs"),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  globalThis.fetch = () => {
    requests++;
    throw new Error("Initial render must not make a network request");
  };
  const { default: renderer } = await import(
    pathToFileURL(join(temp, "initial-render.cjs"))
  );
  const html = renderer.renderInitial();
  assert.equal(
    (html.match(/<img\b/g) || []).length,
    0,
    "initial HTML must not request old logos, covers, or sample-menu images",
  );
  assert.ok(
    !/\bas=["']image["']/.test(html),
    "initial HTML must not preload sample images before store data arrives",
  );
  assert.ok(/\brole="status"/.test(html), "initial render must announce loading");
  assert.ok(html.includes("กำลังโหลดข้อมูลร้าน…"), "show a neutral loading message");
  assert.ok(!html.includes("product-card"), "do not show interactive sample cards");
  assert.ok(!html.includes("฿"), "do not flash default menu prices");
  for (const name of renderer.sampleNames)
    assert.ok(!html.includes(name), "do not flash the sample product: " + name);
  assert.equal(requests, 0, "server rendering must not contact a real API");
  console.log(
    "PASS: initial server render shows a loading status without old images, image preloads, sample products, prices, or network requests",
  );
} finally {
  globalThis.fetch = originalFetch;
  rmSync(temp, { recursive: true, force: true });
}
