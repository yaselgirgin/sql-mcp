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
  {
    name: "describe_view",
    description: "Get column definitions and the SQL definition for a view",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        view: { type: "string", description: "View name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "view"],
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
        ? `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
           FROM INFORMATION_SCHEMA.VIEWS
           WHERE TABLE_SCHEMA = @schema
           ORDER BY TABLE_SCHEMA, TABLE_NAME`
        : `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
           FROM INFORMATION_SCHEMA.VIEWS
           ORDER BY TABLE_SCHEMA, TABLE_NAME`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "describe_view") {
      const { schema, view, database } = args as {
        schema: string;
        view: string;
        database?: string;
      };
      const inputs = [
        { name: "schema", value: schema },
        { name: "view", value: view },
      ];

      const [columns, definitions] = await Promise.all([
        sqlQuery(
          `SELECT
             c.COLUMN_NAME,
             c.ORDINAL_POSITION,
             c.DATA_TYPE,
             c.IS_NULLABLE
           FROM INFORMATION_SCHEMA.COLUMNS c
           WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @view
           ORDER BY c.ORDINAL_POSITION`,
          inputs,
          database
        ),
        sqlQuery(
          `SELECT VIEW_DEFINITION
           FROM INFORMATION_SCHEMA.VIEWS
           WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @view`,
          inputs,
          database
        ),
      ]);

      return textResult({
        columns,
        definition: definitions[0]?.VIEW_DEFINITION ?? null,
      });
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
