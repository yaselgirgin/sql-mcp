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
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
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
      const rows = await sqlQuery(
        `
        SELECT
          s.name AS schema_name,
          p.name AS owner_name
        FROM sys.schemas s
        JOIN sys.database_principals p ON s.principal_id = p.principal_id
        ORDER BY s.name
        `,
        [],
        database
      );
      return textResult(rows);
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
