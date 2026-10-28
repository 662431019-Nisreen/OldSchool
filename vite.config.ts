import vinext from "vinext";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { readCloudflareConfig } from "./scripts/cloudflare-config.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

export default defineConfig(async ({ command, mode }) => {
  configureToolEnvironment(process.cwd());
  // Keep the standalone build independent of Sites settings and preview plugins.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const server = {
    ...(managedLinux
      ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
      : {}),
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  };
  if (mode === "cloudflare") {
    readCloudflareConfig({ requireDatabaseId: command === "build" });
    return {
      server,
      plugins: [
        vinext(),
        cloudflare({
          configPath: "./wrangler.cloudflare.jsonc",
          viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
          inspectorPort: false,
        }),
      ],
    };
  }

  const [{ default: hostingConfig }, { sites }, { connectorPreview }] =
    await Promise.all([
      import("./.openai/hosting.json"),
      import("./scripts/vite/sites-vite-plugin"),
      import("./scripts/vite/connector-preview-plugin.mjs"),
    ]);
  const { d1, r2 } = hostingConfig;
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
  };

  return {
    server,
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      connectorPreview(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "serve"
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./scripts/connector-preview/worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
