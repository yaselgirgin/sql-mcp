import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const databaseTools: Tool[] = [
  {
    name: "list_databases",
    description: "List all online databases on the SQL Server instance",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleDatabaseTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_databases") {
      const rows = await sqlQuery(`
        SELECT
          name,
          database_id,
          state_desc,
          create_date,
          collation_name,
          recovery_model_desc
        FROM sys.databases
        WHERE state_desc = 'ONLINE'
        ORDER BY name
      `);
      return textResult(rows);
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
