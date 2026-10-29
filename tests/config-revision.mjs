import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const sqlite = new DatabaseSync(":memory:");
const temp = mkdtempSync(join(tmpdir(), "oldschool-config-revision-"));
const previousEnv = globalThis.__configRevisionEnv;
let writeBarrier = null;
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let values = [];
    return {
      bind(...bindings) {
        values = bindings;
        return this;
      },
      async first() {
        return statement.get(...values) ?? null;
      },
      async all() {
        return { results: statement.all(...values) };
      },
      async run() {
        if (
          writeBarrier &&
          /^\s*(?:UPDATE\s+config\b|INSERT(?:\s+OR\s+\w+)?\s+INTO\s+config\b)/i.test(
            sql,
          )
        )
          await writeBarrier.wait();
        const result = statement.run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    };
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
const adminCookie = "os_session=config-admin-session";
const staffCookie = "os_session=config-staff-session";
const readStored = () =>
  sqlite.prepare("SELECT value FROM config WHERE key='shop'").get()?.value;
const auditCount = () =>
  sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='config'").get()
    .n;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const fixture = {
  name: "OLD SCHOOL",
  open: "10:00",
  close: "22:00",
  accepting: true,
  tables: 1,
  categories: ["กาแฟ", "โซดา"],
  logo: "/assets/logo-coral.png",
  products: [
    {
      id: "coffee",
      name: "กาแฟ",
      category: "กาแฟ",
      cold: 35,
      image: "/api/images/11111111-1111-4111-8111-111111111111",
    },
    {
      id: "soda",
      name: "โซดา",
      category: "โซดา",
      cold: 30,
      image: "/api/images/22222222-2222-4222-8222-222222222222",
    },
    {
      id: "hidden",
      name: "เมนูซ่อน",
      category: "กาแฟ",
      cold: 45,
      hidden: true,
      image: "/api/images/33333333-3333-4333-8333-333333333333",
    },
  ],
};

try {
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"),
    );
  for (const role of ["admin", "staff"]) {
    sqlite
      .prepare("INSERT INTO users(id,name,role,salt,hash) VALUES(?,?,?,?,?)")
      .run(role, role, role, "unused", "unused");
    sqlite
      .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
      .run(`config-${role}-session`, role, Date.now() + 3_600_000);
  }
  sqlite
    .prepare("INSERT INTO config(key,value) VALUES('shop',?)")
    .run(JSON.stringify(fixture));
  globalThis.__configRevisionEnv = { DB };
  writeFileSync(
    join(temp, "env.mjs"),
    "export const env = globalThis.__configRevisionEnv;\n",
  );
  await build({
    entryPoints: ["app/api/pos/route.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "cloudflare:workers": join(temp, "env.mjs") },
    outfile: join(temp, "route.mjs"),
    logLevel: "silent",
  });
  const { GET, POST } = await import(pathToFileURL(join(temp, "route.mjs")));
  const read = async (action = "admin", cookie = adminCookie) => {
    const response = await GET(
      new Request(`https://example.test/api/pos?action=${action}`, {
        headers: { cookie },
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  const write = async (config, cookie = adminCookie) => {
    const response = await POST(
      new Request("https://example.test/api/pos", {
        method: "POST",
        headers: {
          cookie,
          Origin: "https://example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "config", config }),
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  const concurrent = async (first, second) => {
    let arrived = 0;
    let release, reject;
    const ready = new Promise((resolve, fail) => {
      release = resolve;
      reject = fail;
    });
    const timeout = setTimeout(
      () =>
        reject(
          new Error("Both config writes must reach their atomic SQL statement"),
        ),
      3_000,
    );
    writeBarrier = {
      async wait() {
        arrived++;
        if (arrived === 2) {
          clearTimeout(timeout);
          release();
        }
        await ready;
      },
    };
    try {
      const results = await Promise.all([write(first), write(second)]);
      assert.equal(
        arrived,
        2,
        "both writers must pass the revision check before either SQL mutation runs",
      );
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      return results;
    } finally {
      clearTimeout(timeout);
      release();
      writeBarrier = null;
    }
  };

  const legacy = (await read()).data.config;
  assert.equal(legacy.revision, "legacy");
  assert.equal(
    (await read("menu")).data.config.products.length,
    3,
    "admins must load the full catalog, including hidden images",
  );
  assert.equal((await read("menu", "")).data.config.products.length, 2);
  assert.equal(
    (await read("menu", staffCookie)).data.config.products.length,
    2,
  );
  const beforeAuth = readStored();
  assert.equal((await write(legacy, "")).status, 401);
  assert.equal((await write(legacy, staffCookie)).status, 403);
  assert.equal(readStored(), beforeAuth);

  const tabA = structuredClone(legacy);
  const tabB = structuredClone(legacy);
  tabA.products[0].image = "/api/images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal((await write(tabA)).status, 200);
  const firstSaved = (await read()).data.config;
  assert.match(firstSaved.revision, uuid);
  assert.notEqual(firstSaved.revision, legacy.revision);
  assert.equal(firstSaved.products[0].image, tabA.products[0].image);
  assert.equal(firstSaved.products[1].image, fixture.products[1].image);
  assert.equal(firstSaved.products[2].image, fixture.products[2].image);
  const afterFirst = readStored();
  const successfulAudits = auditCount();
  tabB.products[1].soldOut = true;
  assert.equal(
    (await write(tabB)).status,
    409,
    "an older tab must not erase the newly saved coffee image",
  );
  const missingRevision = structuredClone(firstSaved);
  delete missingRevision.revision;
  assert.equal(
    (await write(missingRevision)).status,
    409,
    "pre-deployment tabs without a revision must refresh",
  );
  assert.equal((await write({ ...firstSaved, revision: 123 })).status, 409);
  assert.equal(
    readStored(),
    afterFirst,
    "rejected saves must leave the stored catalog byte-for-byte unchanged",
  );
  assert.equal(
    auditCount(),
    successfulAudits,
    "rejected saves must not be logged as successful config changes",
  );

  const refreshed = structuredClone(firstSaved);
  refreshed.products[1].image =
    "/api/images/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.equal((await write(refreshed)).status, 200);
  const resaved = (await read()).data.config;
  assert.notEqual(resaved.revision, firstSaved.revision);
  assert.equal(resaved.products[0].image, tabA.products[0].image);
  assert.equal(resaved.products[1].image, refreshed.products[1].image);

  const racingA = { ...structuredClone(resaved), name: "Shop from tab A" };
  const racingB = { ...structuredClone(resaved), name: "Shop from tab B" };
  const updateResults = await concurrent(racingA, racingB);
  const updateWinner = updateResults[0].status === 200 ? racingA : racingB;
  const afterRace = (await read()).data.config;
  assert.equal(afterRace.name, updateWinner.name);
  assert.notEqual(afterRace.revision, resaved.revision);
  assert.deepEqual(afterRace.products, resaved.products);
  assert.equal(
    auditCount(),
    successfulAudits + 2,
    "only the fresh resave and one concurrent winner may add audit entries",
  );

  sqlite.exec("DELETE FROM config WHERE key='shop'");
  const initial = (await read()).data.config;
  assert.equal(initial.revision, "initial");
  const initialA = { ...structuredClone(initial), name: "Initial shop A" };
  const initialB = { ...structuredClone(initial), name: "Initial shop B" };
  const initialResults = await concurrent(initialA, initialB);
  const initialWinner = initialResults[0].status === 200 ? initialA : initialB;
  const created = (await read()).data.config;
  assert.equal(created.name, initialWinner.name);
  assert.match(created.revision, uuid);
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM config WHERE key='shop'").get().n,
    1,
  );
  assert.equal(
    (await write(initial)).status,
    409,
    "a stale initial snapshot cannot replace a catalog created by another tab",
  );

  console.log(
    "PASS: admin-only config writes, hidden-menu preservation, legacy revisions, stale-client rejection, image retention, fresh resaves, and atomic concurrent update/initial-create protection",
  );
} finally {
  writeBarrier = null;
  sqlite.close();
  if (previousEnv === undefined) delete globalThis.__configRevisionEnv;
  else globalThis.__configRevisionEnv = previousEnv;
  rmSync(temp, { recursive: true, force: true });
}
