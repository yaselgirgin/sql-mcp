import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const functionTools: Tool[] = [
  {
    name: "list_functions",
    description:
      "List all user-defined functions in a database (scalar, inline table-valued, and multi-statement table-valued), optionally filtered by schema",
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
    name: "get_function_definition",
    description: "Get the full source definition of a user-defined function",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        name: { type: "string", description: "Function name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleFunctionTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_functions") {
      const { database, schema } = args as { database?: string; schema?: string };
      // FN=scalar, IF=inline TVF, TF=multi-stmt TVF, FS=CLR scalar, FT=CLR TVF
      const query = schema
        ? `SELECT SCHEMA_NAME(o.schema_id) AS function_schema, o.name AS function_name,
             o.type_desc AS function_type, o.create_date, o.modify_date
           FROM sys.objects o
           WHERE o.type IN ('FN','IF','TF','FS','FT')
             AND SCHEMA_NAME(o.schema_id) = @schema
           ORDER BY function_schema, function_name`
        : `SELECT SCHEMA_NAME(o.schema_id) AS function_schema, o.name AS function_name,
             o.type_desc AS function_type, o.create_date, o.modify_date
           FROM sys.objects o
           WHERE o.type IN ('FN','IF','TF','FS','FT')
           ORDER BY function_schema, function_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "get_function_definition") {
      const { schema, name: fnName, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT m.definition, o.type_desc AS function_type
         FROM sys.objects o
         JOIN sys.sql_modules m ON o.object_id = m.object_id
         JOIN sys.schemas s ON o.schema_id = s.schema_id
         WHERE s.name = @schema AND o.name = @name
           AND o.type IN ('FN','IF','TF','FS','FT')`,
        [
          { name: "schema", value: schema },
          { name: "name", value: fnName },
        ],
        database
      );
      if (rows.length === 0) {
        return errorResult(`Function '${schema}.${fnName}' not found.`);
      }
      return textResult(rows[0]);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
