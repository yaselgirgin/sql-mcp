import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const databaseTools: Tool[] = [
  {
    name: "list_databases",
    description: "List all non-template databases accessible on the PostgreSQL server",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function handleDatabaseTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_databases") {
      const rows = await sqlQuery(
        `SELECT datname AS database_name,
                pg_encoding_to_char(encoding) AS encoding,
                datcollate AS collation,
                datctype AS ctype,
                pg_size_pretty(pg_database_size(datname)) AS size
         FROM pg_database
         WHERE datistemplate = false
         ORDER BY datname`
      );
      return textResult(rows);
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
