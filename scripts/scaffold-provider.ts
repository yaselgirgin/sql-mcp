#!/usr/bin/env tsx
/**
 * Scaffolds a new database provider skeleton.
 *
 * Usage:
 *   npm run scaffold -- <provider-name>
 *
 * Example:
 *   npm run scaffold -- mysql
 *
 * Creates src/providers/<name>/ with client.ts, index.ts, and tools/ stubs.
 */

import { mkdir, writeFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const providersDir = join(projectRoot, "src", "providers");

// ── Validation ────────────────────────────────────────────────────────────────

const name = process.argv[2]?.trim();

if (!name) {
  process.stderr.write(
    `Usage: npm run scaffold -- <provider-name>\n` +
      `Example: npm run scaffold -- mysql\n`
  );
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  process.stderr.write(
    `Error: provider name must be lowercase letters, digits, and hyphens only (e.g. "mysql", "sqlite3").\n` +
      `Got: "${name}"\n`
  );
  process.exit(1);
}

const targetDir = join(providersDir, name);
if (existsSync(targetDir)) {
  process.stderr.write(
    `Error: provider '${name}' already exists at src/providers/${name}/\n` +
      `Delete the directory first if you want to re-scaffold.\n`
  );
  process.exit(1);
}

// ── Templates ─────────────────────────────────────────────────────────────────

const CLIENT_TS = `\
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { requestContext } from "../../core/context.js";
import { maskRows, filterListingRows } from "../../core/policy.js";
import { writeAudit, hashQuery } from "../../core/audit.js";

export type { CallToolResult };
export type QueryInput = { name: string; value: string | number | boolean | null };

// Load .env from the project root
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", "..", "..", ".env") });

// TODO: Import and initialise your database driver
// Example (pg):   import pg from "pg";
// Example (mysql2): import mysql from "mysql2/promise";

// TODO: Implement your connection pool management
// const pools = new Map<string, YourPoolType>();

export async function closePools(): Promise<void> {
  // TODO: Close all open connection pools
}

// TODO: Implement query execution using your driver.
// \`inputs\` values should be passed as positional parameters ($1, $2, ...)
// or named parameters depending on your driver.
export async function sqlQuery(
  query: string,
  inputs: QueryInput[] = [],
  database?: string
): Promise<Record<string, unknown>[]> {
  const ctx = requestContext.getStore();
  const startMs = ctx?.startMs ?? Date.now();
  const toolName = ctx?.tool ?? "unknown";
  const args = ctx?.args ?? {};

  // TODO: Replace this stub with your driver's query execution
  throw new Error(
    \`[${name}] sqlQuery() not yet implemented. ` +
    `Wire up your database driver in src/providers/${name}/client.ts\`
  );

  // TEMPLATE: After executing, apply masking + audit (copy this block):
  // let rows = result.rows as Record<string, unknown>[];
  // const schemaName = typeof args.schema === "string" ? args.schema : undefined;
  // const tableName = typeof args.table === "string" ? args.table : undefined;
  // const { rows: maskedRows, maskedColumns } = maskRows(rows, schemaName, tableName);
  // rows = maskedRows;
  // rows = filterListingRows(rows, toolName);
  // writeAudit({
  //   ts: new Date().toISOString(), tool: toolName,
  //   database_name: (typeof args.database === "string" ? args.database : database) ?? null,
  //   schema_name: schemaName ?? null,
  //   object_name: (typeof args.name === "string" ? args.name : tableName) ?? null,
  //   query_hash: hashQuery(query), row_count: rows.length,
  //   masked_cols: maskedColumns.length > 0 ? JSON.stringify(maskedColumns) : null,
  //   blocked: false, block_reason: null, duration_ms: Date.now() - startMs,
  // });
  // return rows;
}

// Safely quote an identifier using double-quotes (ANSI SQL standard)
export function quoteName(name: string): string {
  return \`"\${name.replace(/"/g, '""')}"\`;
}

export function textResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// Validate that a query is read-only.
// Add engine-specific blocked keywords below the generic list.
export function validateReadOnly(query: string): { valid: boolean; error?: string } {
  const noLineComments = query.replace(/--[^\\n]*/g, " ");
  const noComments = noLineComments.replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ");
  const trimmed = noComments.trim();

  if (!/^SELECT\\b/i.test(trimmed) && !/^WITH\\b/i.test(trimmed)) {
    return { valid: false, error: "Only SELECT (and CTE WITH…SELECT) queries are allowed." };
  }

  // Generic write keywords — add engine-specific ones below
  const blocked = [
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "EXECUTE", "MERGE", "GRANT", "REVOKE", "DENY",
    // TODO: add engine-specific keywords, e.g. "COPY" for PostgreSQL
  ];

  for (const kw of blocked) {
    if (new RegExp(\`\\\\b\${kw}\\\\b\`, "i").test(noComments)) {
      return { valid: false, error: \`Query contains disallowed keyword '\${kw}'.\` };
    }
  }
  return { valid: true };
}
`;

const QUERY_TS = `\
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, validateReadOnly, textResult, errorResult } from "../client.js";
import { getPolicy, checkQueryPolicy } from "../../../core/policy.js";
import type { CallToolResult } from "../client.js";

const DEFAULT_MAX_ROWS = 1000;

export const queryTools: Tool[] = [
  {
    name: "execute_query",
    description:
      "Execute a read-only SELECT query. " +
      "Only SELECT statements (and CTEs using WITH) are permitted. " +
      \`Results are capped at \${DEFAULT_MAX_ROWS} rows by default.\`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The SELECT query to execute" },
        database: { type: "string", description: "Database to run the query against" },
        max_rows: {
          type: "number",
          description: \`Maximum rows to return (default: \${DEFAULT_MAX_ROWS}, max: 5000)\`,
        },
      },
      required: ["query"],
    },
  },
];

export async function handleQueryTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "execute_query") {
      const { query, database, max_rows } = args as {
        query: string; database?: string; max_rows?: number;
      };

      const validation = validateReadOnly(query);
      if (!validation.valid) return errorResult(validation.error!);

      const policyCheck = checkQueryPolicy(query);
      if (!policyCheck.allowed) return errorResult(policyCheck.reason);

      const policy = getPolicy();
      const limit = Math.min(max_rows ?? DEFAULT_MAX_ROWS, policy.maxRows);
      const rows = await sqlQuery(query, [], database);
      const trimmed = rows.slice(0, limit);
      return textResult({ rows: trimmed, row_count: trimmed.length, truncated: trimmed.length < rows.length });
    }
    return errorResult(\`Unknown tool: \${name}\`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
`;

const DATABASES_TS = `\
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const databaseTools: Tool[] = [
  {
    name: "list_databases",
    description: "List all accessible databases on the server",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function handleDatabaseTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_databases") {
      // TODO: Replace with the correct query for your database engine
      // PostgreSQL: SELECT datname AS database_name FROM pg_database WHERE datistemplate = false ORDER BY datname
      // MySQL:      SELECT schema_name AS database_name FROM information_schema.schemata ORDER BY schema_name
      const rows = await sqlQuery(\`/* TODO: list databases */\`, []);
      return textResult(rows);
    }
    return errorResult(\`Unknown tool: \${name}\`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
`;

const SCHEMAS_TS = `\
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const schemaTools: Tool[] = [
  {
    name: "list_schemas",
    description: "List all schemas in a database",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
      },
    },
  },
];

export async function handleSchemaTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_schemas") {
      const { database } = args as { database?: string };
      // TODO: Replace with the correct query for your database engine
      // PostgreSQL: SELECT schema_name FROM information_schema.schemata
      //             WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
      //             ORDER BY schema_name
      const rows = await sqlQuery(\`/* TODO: list schemas */\`, [], database);
      return textResult(rows);
    }
    return errorResult(\`Unknown tool: \${name}\`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
`;

const TABLES_TS = `\
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const tableTools: Tool[] = [
  {
    name: "list_tables",
    description: "List tables in a database, optionally filtered by schema",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
        schema: { type: "string", description: "Schema name filter" },
      },
    },
  },
  {
    name: "describe_table",
    description: "Get column definitions for a table",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name" },
        table: { type: "string", description: "Table name" },
        database: { type: "string", description: "Database name" },
      },
      required: ["schema", "table"],
    },
  },
];

export async function handleTableTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_tables") {
      const { database, schema } = args as { database?: string; schema?: string };
      // TODO: Replace with your engine's query
      // PostgreSQL example (with optional schema filter):
      //   SELECT table_schema, table_name, table_type
      //   FROM information_schema.tables
      //   WHERE table_schema NOT IN ('pg_catalog','information_schema')
      //   [AND table_schema = $1]
      //   ORDER BY table_schema, table_name
      const rows = await sqlQuery(\`/* TODO: list tables */\`, [], database);
      return textResult(rows);
    }

    if (name === "describe_table") {
      const { schema, table, database } = args as {
        schema: string; table: string; database?: string;
      };
      // TODO: Replace with your engine's column query
      // PostgreSQL: SELECT column_name, data_type, character_maximum_length,
      //               is_nullable, column_default, ordinal_position
      //             FROM information_schema.columns
      //             WHERE table_schema = $1 AND table_name = $2
      //             ORDER BY ordinal_position
      const rows = await sqlQuery(\`/* TODO: describe table */\`, [
        { name: "schema", value: schema },
        { name: "table", value: table },
      ], database);
      if (rows.length === 0) return errorResult(\`Table '\${schema}.\${table}' not found.\`);
      return textResult(rows);
    }

    return errorResult(\`Unknown tool: \${name}\`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
`;

const INDEX_TS = `\
import { databaseTools, handleDatabaseTool } from "./tools/databases.js";
import { schemaTools, handleSchemaTool } from "./tools/schemas.js";
import { tableTools, handleTableTool } from "./tools/tables.js";
import { queryTools, handleQueryTool } from "./tools/query.js";
import { validateReadOnly, closePools } from "./client.js";
import type { DatabaseProvider } from "../../core/types.js";

export const ${name.replace(/-./g, (m) => m[1].toUpperCase())}Provider: DatabaseProvider = {
  id: "${name}",
  name: "${name.charAt(0).toUpperCase() + name.slice(1)}",

  tools: [
    ...databaseTools,
    ...schemaTools,
    ...tableTools,
    // TODO: add more tool arrays as you implement them
    ...queryTools,
  ],

  handlers: {
    list_databases: handleDatabaseTool,
    list_schemas: handleSchemaTool,
    list_tables: handleTableTool,
    describe_table: handleTableTool,
    // TODO: add more handler entries as you implement them
    execute_query: handleQueryTool,
  },

  validateReadOnly,
  close: closePools,
};

export function checkEnv(): void {
  // TODO: Add your required env var checks here
  // Example:
  // if (process.env.PG_CONNECTION_STRING) return;
  // const required = ["PG_HOST", "PG_USER", "PG_PASSWORD"];
  // const missing = required.filter(v => !process.env[v]);
  // if (missing.length > 0) {
  //   process.stderr.write(\`[${name}] ERROR: missing env vars: \${missing.join(", ")}\\n\`);
  //   process.exit(1);
  // }
}
`;

// ── File creation ─────────────────────────────────────────────────────────────

const files: [string, string][] = [
  [join(targetDir, "client.ts"), CLIENT_TS],
  [join(targetDir, "index.ts"), INDEX_TS],
  [join(targetDir, "tools", "query.ts"), QUERY_TS],
  [join(targetDir, "tools", "databases.ts"), DATABASES_TS],
  [join(targetDir, "tools", "schemas.ts"), SCHEMAS_TS],
  [join(targetDir, "tools", "tables.ts"), TABLES_TS],
];

await mkdir(join(targetDir, "tools"), { recursive: true });

for (const [filePath, content] of files) {
  await writeFile(filePath, content, "utf8");
}

// ── Output ────────────────────────────────────────────────────────────────────

const camel = name.replace(/-./g, (m) => m[1].toUpperCase());

process.stdout.write(`
Scaffolded provider '${name}' — ${files.length} files created.

  src/providers/${name}/
  ├── client.ts           ← wire up your DB driver here
  ├── index.ts            ← provider assembly (compiles immediately)
  └── tools/
      ├── query.ts        ← ready once sqlQuery() works
      ├── databases.ts    ← fill in TODO query
      ├── schemas.ts      ← fill in TODO query
      └── tables.ts       ← fill in TODO queries (list_tables, describe_table)

Next steps:
  1. Install your driver:  npm install <your-driver>
  2. Implement sqlQuery() in src/providers/${name}/client.ts
  3. Fill in TODO queries in the tools/ files
  4. Wire up the provider in src/index.ts:
       import { ${camel}Provider, checkEnv } from "./providers/${name}/index.js";
  5. Run: npm run build

`);
