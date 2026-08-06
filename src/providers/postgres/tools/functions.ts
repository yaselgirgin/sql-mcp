import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const functionTools: Tool[] = [
  {
    name: "list_functions",
    description: "List all user-defined functions and procedures in a database, optionally filtered by schema",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
        schema: { type: "string", description: "Schema name filter" },
      },
    },
  },
  {
    name: "get_function_definition",
    description: "Get the source definition of a user-defined function or procedure",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name" },
        name: { type: "string", description: "Function name" },
        database: { type: "string", description: "Database name" },
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
      const query = schema
        ? `SELECT n.nspname AS function_schema,
                  p.proname AS function_name,
                  CASE p.prokind
                    WHEN 'f' THEN 'FUNCTION'
                    WHEN 'p' THEN 'PROCEDURE'
                    WHEN 'a' THEN 'AGGREGATE'
                    WHEN 'w' THEN 'WINDOW'
                    ELSE p.prokind::text
                  END AS function_kind,
                  pg_get_function_arguments(p.oid) AS arguments,
                  pg_get_function_result(p.oid) AS return_type,
                  l.lanname AS language
           FROM pg_proc p
           JOIN pg_namespace n ON p.pronamespace = n.oid
           JOIN pg_language l ON p.prolang = l.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema')
             AND n.nspname = $1
           ORDER BY function_schema, function_name`
        : `SELECT n.nspname AS function_schema,
                  p.proname AS function_name,
                  CASE p.prokind
                    WHEN 'f' THEN 'FUNCTION'
                    WHEN 'p' THEN 'PROCEDURE'
                    WHEN 'a' THEN 'AGGREGATE'
                    WHEN 'w' THEN 'WINDOW'
                    ELSE p.prokind::text
                  END AS function_kind,
                  pg_get_function_arguments(p.oid) AS arguments,
                  pg_get_function_result(p.oid) AS return_type,
                  l.lanname AS language
           FROM pg_proc p
           JOIN pg_namespace n ON p.pronamespace = n.oid
           JOIN pg_language l ON p.prolang = l.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema')
           ORDER BY function_schema, function_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "get_function_definition") {
      const { schema, name: funcName, database } = args as {
        schema: string; name: string; database?: string;
      };
      // Returns the first matching overload's definition
      const rows = await sqlQuery(
        `SELECT p.proname AS function_name,
                pg_get_function_arguments(p.oid) AS arguments,
                pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = $1 AND p.proname = $2
         ORDER BY p.oid
         LIMIT 1`,
        [{ name: "schema", value: schema }, { name: "name", value: funcName }],
        database
      );
      if (rows.length === 0) return errorResult(`Function '${schema}.${funcName}' not found.`);
      return textResult(rows[0]);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
