import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const temporalTableTools: Tool[] = [
  {
    name: "list_temporal_tables",
    description:
      "List all system-versioned temporal tables in a database, showing the linked history table for each",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
        schema: {
          type: "string",
          description: "Schema name to filter by (e.g. dbo)",
        },
      },
    },
  },
];

export async function handleTemporalTableTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_temporal_tables") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT
             SCHEMA_NAME(t.schema_id) AS table_schema,
             t.name AS table_name,
             t.temporal_type_desc,
             SCHEMA_NAME(h.schema_id) AS history_schema,
             h.name AS history_table_name,
             t.create_date,
             t.modify_date
           FROM sys.tables t
           LEFT JOIN sys.tables h ON t.history_table_id = h.object_id
           WHERE t.temporal_type = 2
             AND SCHEMA_NAME(t.schema_id) = @schema
           ORDER BY table_schema, table_name`
        : `SELECT
             SCHEMA_NAME(t.schema_id) AS table_schema,
             t.name AS table_name,
             t.temporal_type_desc,
             SCHEMA_NAME(h.schema_id) AS history_schema,
             h.name AS history_table_name,
             t.create_date,
             t.modify_date
           FROM sys.tables t
           LEFT JOIN sys.tables h ON t.history_table_id = h.object_id
           WHERE t.temporal_type = 2
           ORDER BY table_schema, table_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
