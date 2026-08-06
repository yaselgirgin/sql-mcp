import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const userTypeTools: Tool[] = [
  {
    name: "list_user_types",
    description:
      "List all user-defined types (scalar alias types and table types) in a database, optionally filtered by schema",
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
    name: "get_table_type_columns",
    description: "Get the column definitions for a user-defined table type",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        name: { type: "string", description: "Table type name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleUserTypeTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_user_types") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT
             SCHEMA_NAME(t.schema_id) AS type_schema,
             t.name AS type_name,
             t.is_table_type,
             CASE WHEN t.is_table_type = 1 THEN 'TABLE'
               ELSE TYPE_NAME(t.system_type_id) END AS base_type,
             t.max_length,
             t.precision,
             t.scale,
             t.is_nullable
           FROM sys.types t
           WHERE t.is_user_defined = 1
             AND SCHEMA_NAME(t.schema_id) = @schema
           ORDER BY type_schema, type_name`
        : `SELECT
             SCHEMA_NAME(t.schema_id) AS type_schema,
             t.name AS type_name,
             t.is_table_type,
             CASE WHEN t.is_table_type = 1 THEN 'TABLE'
               ELSE TYPE_NAME(t.system_type_id) END AS base_type,
             t.max_length,
             t.precision,
             t.scale,
             t.is_nullable
           FROM sys.types t
           WHERE t.is_user_defined = 1
           ORDER BY type_schema, type_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "get_table_type_columns") {
      const { schema, name: typeName, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           c.column_id AS ordinal_position,
           c.name AS column_name,
           TYPE_NAME(c.user_type_id) AS data_type,
           c.max_length,
           c.precision,
           c.scale,
           c.is_nullable
         FROM sys.table_types tt
         JOIN sys.schemas s ON tt.schema_id = s.schema_id
         JOIN sys.columns c ON tt.type_table_object_id = c.object_id
         WHERE s.name = @schema AND tt.name = @name
         ORDER BY c.column_id`,
        [
          { name: "schema", value: schema },
          { name: "name", value: typeName },
        ],
        database
      );
      if (rows.length === 0) {
        return errorResult(`Table type '${schema}.${typeName}' not found.`);
      }
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
