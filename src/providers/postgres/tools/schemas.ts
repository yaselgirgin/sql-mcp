import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const schemaTools: Tool[] = [
  {
    name: "list_schemas",
    description:
      "List all user-defined schemas in a PostgreSQL database (excludes pg_catalog, information_schema, and pg_toast)",
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
        `SELECT s.schema_name,
                r.rolname AS owner,
                obj_description(n.oid, 'pg_namespace') AS description
         FROM information_schema.schemata s
         JOIN pg_namespace n ON n.nspname = s.schema_name
         JOIN pg_roles r ON r.oid = n.nspowner
         WHERE s.schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           AND s.schema_name NOT LIKE 'pg_temp_%'
           AND s.schema_name NOT LIKE 'pg_toast_temp_%'
         ORDER BY s.schema_name`,
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
