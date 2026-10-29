import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { finalizeAppRscResponse } from "../node_modules/vinext/dist/server/app-rsc-response-finalizer.js";

const temp = mkdtempSync(join(tmpdir(), "oldschool-image-cache-"));
const originalCaches = globalThis.caches;
const key = "d9f0eb00-4353-4558-bfa8-38c61d693f5b";
const url = "https://example.test/api/images/" + key;
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const dataUrl =
  "data:image/png;base64," + Buffer.from(bytes).toString("base64");
let matches = 0;
try {
  writeFileSync(join(temp, "env.mjs"), "export const env = {};\n");
  await build({
    entryPoints: ["app/api/images/[key]/route.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "cloudflare:workers": join(temp, "env.mjs") },
    outfile: join(temp, "route.mjs"),
    logLevel: "silent",
  });
  globalThis.caches = {
    async open() {
      return {
        async match(request) {
          assert.equal(request.url, url);
          matches++;
          // Fetch responses have the same immutable header guard as edge cache hits.
          const cached = await fetch(dataUrl);
          assert.throws(() => cached.headers.set("Vary", "test"), /immutable/i);
          return cached;
        },
      };
    },
  };
  const { GET } = await import(pathToFileURL(join(temp, "route.mjs")));
  const request = new Request(url);
  const response = await GET(request, { params: Promise.resolve({ key }) });
  await finalizeAppRscResponse(response, request, { configHeaders: [] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.ok(response.headers.get("Vary"));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);

  const conditionalRequest = new Request(url, {
    headers: { "If-None-Match": `"${key}"` },
  });
  const conditional = await GET(conditionalRequest, {
    params: Promise.resolve({ key }),
  });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.body, null);
  assert.equal(conditional.headers.get("ETag"), `"${key}"`);
  assert.equal(
    conditional.headers.get("Cache-Control"),
    "public,max-age=31536000,immutable",
  );
  assert.equal(
    matches,
    2,
    "cache hits must succeed without a database binding",
  );
  console.log(
    "PASS: immutable cached images survive framework header finalization; image bytes, MIME, and conditional 304 are preserved",
  );
} finally {
  if (originalCaches === undefined) delete globalThis.caches;
  else globalThis.caches = originalCaches;
  rmSync(temp, { recursive: true, force: true });
}
