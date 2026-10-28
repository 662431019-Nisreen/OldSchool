import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Exercise the actual worker after-response hook, with no real D1 or Push call.
const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), "old-school-push-recovery-"),
);
fs.writeFileSync(
  path.join(temp, "handler.mjs"),
  "export default {fetch: async () => new Response('ok', {status:globalThis.__recovery.status})};",
);
fs.writeFileSync(
  path.join(temp, "push.mjs"),
  `export async function drainPendingPush() {
    const state=globalThis.__recovery;
    state.checks++;
    if(state.hold) await state.hold;
    if(state.fail) { state.fail=false; throw new Error('temporary D1 failure'); }
  }`,
);
await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  define: { "import.meta.env.DEV": "false" },
  plugins: [
    {
      name: "isolated-push-hook",
      setup(b) {
        b.onResolve({ filter: /^vinext\/server\/fetch-handler$/ }, () => ({
          path: path.join(temp, "handler.mjs"),
        }));
        b.onResolve({ filter: /^\.\.\/lib\/push$/ }, () => ({
          path: path.join(temp, "push.mjs"),
        }));
      },
    },
  ],
  outfile: path.join(temp, "worker.mjs"),
  logLevel: "silent",
});
const state = (globalThis.__recovery = {
  status: 200,
  checks: 0,
  hold: null,
  fail: false,
});
const originalNow = Date.now;
const originalError = console.error;
let now = 1_800_000_000_000;
let logged = [];
Date.now = () => now;
console.error = (...args) => logged.push(args);
try {
  const { default: worker } = await import(
    pathToFileURL(path.join(temp, "worker.mjs"))
  );
  async function request(method = "GET", pathname = "/api/pos?action=orders") {
    const work = [];
    const response = await worker.fetch(
      new Request("https://coffee.test" + pathname, { method }),
      {},
      { waitUntil: (promise) => work.push(promise) },
    );
    assert.equal(response.status, state.status);
    return work;
  }
  const finish = (work) => Promise.all(work);
  await finish(await request());
  assert.equal(state.checks, 1);
  for (let i = 0; i < 100; i++)
    await finish(await request("GET", "/api/pos?action=menu"));
  assert.equal(state.checks, 1, "poll bursts share the read recovery interval");
  now += 29_999;
  await finish(await request());
  assert.equal(state.checks, 1);
  now++;
  await finish(await request());
  assert.equal(state.checks, 2, "idle queue is checked again after 30 seconds");

  await finish(await request("POST"));
  assert.equal(state.checks, 3, "successful mutations bypass read cooldown");
  state.status = 400;
  await finish(await request("POST"));
  assert.equal(state.checks, 3, "rejected mutations do not add queue work");
  state.status = 200;
  await finish(await request("GET", "/admin"));
  await finish(await request("GET", "/api/images/example"));
  await finish(await request("OPTIONS"));
  assert.equal(state.checks, 3, "unrelated routes and methods do not drain");

  // A GET can read the queue just before a POST enqueues. The POST must still
  // run its own drain instead of being swallowed by a shared in-flight promise.
  now += 30_000;
  let release;
  state.hold = new Promise((resolve) => (release = resolve));
  const pendingGet = await request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.checks, 4);
  const pendingPost = await request("POST");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    state.checks,
    5,
    "new enqueues are checked during an in-flight GET",
  );
  release();
  await finish([...pendingGet, ...pendingPost]);
  state.hold = null;

  state.fail = true;
  await finish(await request("POST"));
  assert.equal(state.checks, 6);
  assert.equal(logged.length, 1);
  assert.deepEqual(logged[0], ["push_queue_check_failed"]);
  await finish(await request());
  assert.equal(
    state.checks,
    7,
    "a failed check permits immediate read recovery",
  );
  console.log(
    "PASS: real worker hook; poll throttling, immediate mutation dispatch, in-flight enqueue recovery, transient failure retry, and route isolation.",
  );
} finally {
  Date.now = originalNow;
  console.error = originalError;
  delete globalThis.__recovery;
  fs.rmSync(temp, { recursive: true, force: true });
}
