import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const linkedServerTools: Tool[] = [
  {
    name: "list_linked_servers",
    description:
      "List all linked servers configured on the SQL Server instance. " +
      "Requires VIEW ANY DEFINITION or sysadmin — will return an empty result set if the login lacks this permission.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleLinkedServerTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_linked_servers") {
      const rows = await sqlQuery(
        `SELECT
           name AS server_name,
           product,
           provider,
           data_source,
           location,
           catalog,
           is_remote_login_enabled,
           is_rpc_out_enabled,
           modify_date
         FROM sys.servers
         WHERE is_linked = 1
         ORDER BY name`
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
