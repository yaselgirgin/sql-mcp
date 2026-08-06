import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const serverPropertyTools: Tool[] = [
  {
    name: "get_server_properties",
    description: "Get PostgreSQL server version, configuration, and runtime properties",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function handleServerPropertyTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "get_server_properties") {
      const rows = await sqlQuery(
        `SELECT
           version() AS version_string,
           current_setting('server_version') AS server_version,
           current_setting('server_version_num')::int AS server_version_num,
           current_database() AS current_database,
           current_user AS current_user,
           pg_postmaster_start_time() AS start_time,
           current_setting('max_connections')::int AS max_connections,
           current_setting('shared_buffers') AS shared_buffers,
           current_setting('work_mem') AS work_mem,
           current_setting('maintenance_work_mem') AS maintenance_work_mem,
           current_setting('effective_cache_size') AS effective_cache_size,
           current_setting('TimeZone') AS server_timezone,
           current_setting('lc_messages') AS lc_messages,
           current_setting('lc_monetary') AS lc_monetary,
           pg_size_pretty(
             (SELECT sum(pg_database_size(datname)) FROM pg_database WHERE datistemplate = false)
           ) AS total_databases_size`
      );
      return textResult(rows[0] ?? {});
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
