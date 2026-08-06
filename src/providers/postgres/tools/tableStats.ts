import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const tableStatsTools: Tool[] = [
  {
    name: "get_table_stats",
    description: "Get row count and storage size statistics for a table",
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

export async function handleTableStatsTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "get_table_stats") {
      const { schema, table, database } = args as {
        schema: string; table: string; database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           s.relname AS table_name,
           s.schemaname AS table_schema,
           s.n_live_tup AS estimated_row_count,
           s.n_dead_tup AS dead_row_count,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
           pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
           pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
           pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS toast_and_indexes_size,
           s.last_vacuum,
           s.last_autovacuum,
           s.last_analyze,
           s.last_autoanalyze
         FROM pg_stat_user_tables s
         JOIN pg_class c ON c.relname = s.relname
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.schemaname
         WHERE s.schemaname = $1 AND s.relname = $2`,
        [{ name: "schema", value: schema }, { name: "table", value: table }],
        database
      );
      if (rows.length === 0) return errorResult(`Table '${schema}.${table}' not found or has no statistics.`);
      return textResult(rows[0]);
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
