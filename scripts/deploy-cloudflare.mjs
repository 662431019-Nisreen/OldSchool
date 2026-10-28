import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkCloudflareDeployment } from "./cloudflare-config.mjs";

checkCloudflareDeployment();
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
    ),
    "deploy",
    "--config",
    "dist/server/wrangler.json",
  ],
  { stdio: "inherit", cwd: fileURLToPath(new URL("../", import.meta.url)) },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
