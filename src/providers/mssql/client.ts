import sql from "mssql";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { requestContext } from "../../core/context.js";
import { maskRows, filterListingRows } from "../../core/policy.js";
import { writeAudit, hashQuery } from "../../core/audit.js";

export type { CallToolResult };
export type { QueryInput } from "../../core/types.js";

// Load .env from the project root regardless of working directory
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", "..", "..", ".env") });

// Access level — 'read' is the only supported level for now.
// Future: extend to 'write' to allow INSERT/UPDATE/DELETE.
export type AccessLevel = "read";
export const ACCESS_LEVEL: AccessLevel = "read";

// Normalise an ADO.NET connection string to the key names the mssql driver understands.
// Users often copy-paste strings from .NET app configs; this makes those work without changes.
const ADO_ALIASES: [RegExp, string][] = [
  [/\bData\s+Source\s*=/gi,           "Server="],
  [/\bInitial\s+Catalog\s*=/gi,       "Database="],
  [/\bUser\s+ID\s*=/gi,               "User Id="],
  [/\bIntegrated\s+Security\s*=/gi,   "Trusted_Connection="],
  // Strip keys the mssql driver doesn't understand (silently ignored → unexpected behaviour)
  [/\bPersist\s+Security\s+Info\s*=[^;]*;?/gi,    ""],
  [/\bMultipleActiveResultSets\s*=[^;]*;?/gi,      ""],
  [/\bApplication\s+Name\s*=[^;]*;?/gi,            ""],
  [/\bConnect\s+Timeout\s*=/gi,       "Connection Timeout="],
];

function normalizeConnectionString(connStr: string): string {
  let s = connStr;
  for (const [pattern, replacement] of ADO_ALIASES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

// Overrides (or appends) the Database= component in an ADO.NET connection string
function connectionStringWithDatabase(connStr: string, database: string): string {
  const replaced = connStr.replace(
    /\b(database|initial\s+catalog)\s*=\s*[^;]*/gi,
    `Database=${database}`
  );
  // No existing database key — append it
  if (replaced === connStr) {
    return `${connStr.replace(/;?\s*$/, "")};Database=${database}`;
  }
  return replaced;
}

// Returns a connection string or config object depending on what env vars are set
function buildConnectionSource(database?: string): string | sql.config {
  const raw = process.env.SQL_CONNECTION_STRING;
  if (raw) {
    const connStr = normalizeConnectionString(raw);
    return database ? connectionStringWithDatabase(connStr, database) : connStr;
  }
  return {
    server: process.env.SQL_SERVER!,
    port: parseInt(process.env.SQL_PORT ?? "1433"),
    database: database ?? process.env.SQL_DATABASE,
    user: process.env.SQL_USER!,
    password: process.env.SQL_PASSWORD!,
    options: {
      encrypt: process.env.SQL_ENCRYPT !== "false",
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === "true",
    },
    connectionTimeout: 30000,
    requestTimeout: parseInt(process.env.SQL_REQUEST_TIMEOUT ?? "30000"),
  };
}

function getPoolKey(database?: string): string {
  const usingConnStr = !!process.env.SQL_CONNECTION_STRING;
  if (!database) {
    return usingConnStr ? "__connstr__" : (process.env.SQL_DATABASE ?? "__default__");
  }
  return usingConnStr ? `__connstr__:${database}` : database;
}

// One pool per database key to avoid USE [db] in pooled connections
const pools = new Map<string, sql.ConnectionPool>();

export async function getPool(database?: string): Promise<sql.ConnectionPool> {
  const key = getPoolKey(database);
  if (!pools.has(key)) {
    const pool = await new sql.ConnectionPool(
      buildConnectionSource(database) as sql.config
    ).connect();
    pool.on("error", (err: Error) => {
      process.stderr.write(`[mssql] Pool error [${key}]: ${err.message}\n`);
      pools.delete(key);
    });
    pools.set(key, pool);
  }
  return pools.get(key)!;
}

export async function closePools(): Promise<void> {
  for (const pool of pools.values()) {
    await pool.close();
  }
  pools.clear();
}

export async function sqlQuery(
  query: string,
  inputs: { name: string; value: string | number | boolean | null }[] = [],
  database?: string
): Promise<Record<string, unknown>[]> {
  const ctx = requestContext.getStore();
  const startMs = ctx?.startMs ?? Date.now();
  const toolName = ctx?.tool ?? "unknown";
  const args = ctx?.args ?? {};

  const pool = await getPool(database);
  const request = pool.request();
  for (const { name, value } of inputs) {
    request.input(name, value);
  }
  const result = await request.query(query);
  let rows = result.recordset as Record<string, unknown>[];

  // Extract schema/table from args for masking/filtering
  const schemaName = typeof args.schema === "string" ? args.schema : undefined;
  const tableName = typeof args.table === "string" ? args.table : undefined;
  const objectName = typeof args.name === "string" ? args.name : tableName;
  const dbName = typeof args.database === "string" ? args.database : database;

  // Apply column masking
  const { rows: maskedRows, maskedColumns } = maskRows(rows, schemaName, tableName);
  rows = maskedRows;

  // Filter listing results (e.g. remove blocked tables from list_tables output)
  rows = filterListingRows(rows, toolName);

  // Write audit record (fire-and-forget)
  writeAudit({
    ts: new Date().toISOString(),
    tool: toolName,
    database_name: dbName ?? null,
    schema_name: schemaName ?? null,
    object_name: objectName ?? null,
    query_hash: hashQuery(query),
    row_count: rows.length,
    masked_cols: maskedColumns.length > 0 ? JSON.stringify(maskedColumns) : null,
    blocked: false,
    block_reason: null,
    duration_ms: Date.now() - startMs,
  });

  return rows;
}

// Safely quote a SQL Server identifier: wraps in [] and escapes ] as ]]
export function quoteName(name: string): string {
  return `[${name.replace(/\]/g, "]]")}]`;
}

export function textResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// Validate that a query is read-only (SELECT / CTE only).
// Belt-and-suspenders: the SQL Server login should also be read-only.
export function validateReadOnly(query: string): { valid: boolean; error?: string } {
  // Strip line comments and block comments before keyword checks
  const noLineComments = query.replace(/--[^\n]*/g, " ");
  const noComments = noLineComments.replace(/\/\*[\s\S]*?\*\//g, " ");
  const trimmed = noComments.trim();

  if (!/^SELECT\b/i.test(trimmed) && !/^WITH\b/i.test(trimmed)) {
    return {
      valid: false,
      error: "Only SELECT (and CTE WITH…SELECT) queries are allowed in read mode.",
    };
  }

  const blocked = [
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "EXEC", "EXECUTE", "MERGE", "GRANT", "REVOKE",
    "DENY", "BULK", "OPENROWSET", "OPENDATASOURCE",
  ];

  for (const kw of blocked) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(noComments)) {
      return {
        valid: false,
        error: `Query contains disallowed keyword '${kw}'. Only SELECT queries are allowed in read mode.`,
      };
    }
  }

  return { valid: true };
}
