import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load .env before the provider modules so env vars are available
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

import { initAuditPool } from "./core/audit.js";
import { startStdio, startHttp } from "./core/server.js";

const providerName = (process.env.DB_PROVIDER ?? "mssql").toLowerCase();

const { provider, checkEnv } = await (async () => {
  if (providerName === "postgres") {
    const m = await import("./providers/postgres/index.js");
    return { provider: m.postgresProvider, checkEnv: m.checkEnv };
  }
  if (providerName === "mssql") {
    const m = await import("./providers/mssql/index.js");
    return { provider: m.mssqlProvider, checkEnv: m.checkEnv };
  }
  process.stderr.write(
    `[sql-mcp] Unknown provider '${providerName}'. ` +
      `Set DB_PROVIDER to one of: mssql, postgres\n`
  );
  process.exit(1);
})();

async function main() {
  checkEnv();
  await initAuditPool();
  await provider.initialize?.();
  const port = process.env.PORT ? parseInt(process.env.PORT) : null;
  if (port) {
    await startHttp(provider, port);
  } else {
    await startStdio(provider);
  }
}

main().catch((err) => {
  process.stderr.write(`[${providerName}] Fatal: ${err}\n`);
  process.exit(1);
});
