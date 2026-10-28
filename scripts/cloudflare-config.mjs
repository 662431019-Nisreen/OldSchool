import { readFileSync } from "node:fs";
import ts from "typescript";

const placeholder = "00000000-0000-4000-8000-000000000000";
const paidBindings = [
  "r2_buckets",
  "queues",
  "durable_objects",
  "vectorize",
  "ai",
  "images",
  "browser",
  "hyperdrive",
  "services",
  "kv_namespaces",
];
function hasBinding(value) {
  if (Array.isArray(value)) return value.some(hasBinding);
  if (value && typeof value === "object")
    return Object.values(value).some(hasBinding);
  return (
    value !== null && value !== undefined && value !== false && value !== ""
  );
}

export function readCloudflareConfig({ requireDatabaseId = true } = {}) {
  // Accept comments and trailing commas supported by Wrangler's JSONC format.
  const { config, error } = ts.parseConfigFileTextToJson(
    "wrangler.cloudflare.jsonc",
    readFileSync(
      new URL("../wrangler.cloudflare.jsonc", import.meta.url),
      "utf8",
    ),
  );
  if (error)
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  for (const key of paidBindings) {
    if (config[key])
      throw new Error(`Standalone Free configuration must not enable ${key}.`);
  }
  const databases = config.d1_databases;
  if (databases?.length !== 1 || databases[0].binding !== "DB")
    throw new Error(
      "Standalone Free configuration requires one D1 database bound as DB.",
    );
  if (
    requireDatabaseId &&
    (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(
      databases[0].database_id,
    ) ||
      databases[0].database_id === placeholder)
  )
    throw new Error(
      "Set your own Cloudflare D1 database_id in wrangler.cloudflare.jsonc before building or deploying.",
    );
  return config;
}

export function checkCloudflareDeployment() {
  const config = readCloudflareConfig();
  const generated = JSON.parse(
    readFileSync(
      new URL("../dist/server/wrangler.json", import.meta.url),
      "utf8",
    ),
  );
  for (const key of paidBindings) {
    const binding = generated[key];
    if (hasBinding(binding))
      throw new Error(
        `Generated deployment includes unexpected ${key}; rebuild with npm run build:cloudflare.`,
      );
  }
  if (
    generated.name !== config.name ||
    generated.account_id !== config.account_id ||
    generated.d1_databases?.length !== 1 ||
    generated.d1_databases[0].binding !== "DB" ||
    generated.d1_databases[0].database_id !== config.d1_databases[0].database_id
  )
    throw new Error(
      "Build artifacts do not match your standalone Cloudflare configuration; run npm run build:cloudflare.",
    );
  return generated;
}
