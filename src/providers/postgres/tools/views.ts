import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const viewTools: Tool[] = [
  {
    name: "list_views",
    description: "List all views in a database, optionally filtered by schema",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
        schema: { type: "string", description: "Schema name filter" },
      },
    },
  },
  {
    name: "describe_view",
    description: "Get column definitions and the definition SQL for a view",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name" },
        name: { type: "string", description: "View name" },
        database: { type: "string", description: "Database name" },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleViewTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_views") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT table_schema AS view_schema, table_name AS view_name,
                  is_updatable, is_insertable_into
           FROM information_schema.views
           WHERE table_schema NOT IN ('pg_catalog','information_schema')
             AND table_schema = $1
           ORDER BY view_schema, view_name`
        : `SELECT table_schema AS view_schema, table_name AS view_name,
                  is_updatable, is_insertable_into
           FROM information_schema.views
           WHERE table_schema NOT IN ('pg_catalog','information_schema')
           ORDER BY view_schema, view_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "describe_view") {
      const { schema, name: viewName, database } = args as {
        schema: string; name: string; database?: string;
      };
      const [columns, definition] = await Promise.all([
        sqlQuery(
          `SELECT column_name, ordinal_position, data_type,
                  character_maximum_length, is_nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [{ name: "schema", value: schema }, { name: "name", value: viewName }],
          database
        ),
        sqlQuery(
          `SELECT pg_get_viewdef(
             (quote_ident($1)||'.'||quote_ident($2))::regclass, true
           ) AS definition`,
          [{ name: "schema", value: schema }, { name: "name", value: viewName }],
          database
        ),
      ]);
      if (columns.length === 0) return errorResult(`View '${schema}.${viewName}' not found.`);
      return textResult({ columns, definition: definition[0]?.definition ?? null });
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
