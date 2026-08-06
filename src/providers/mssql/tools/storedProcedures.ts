import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const storedProcedureTools: Tool[] = [
  {
    name: "list_stored_procedures",
    description: "List all stored procedures in a database, optionally filtered by schema",
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
    name: "get_stored_procedure_definition",
    description: "Get the full source definition of a stored procedure",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        name: { type: "string", description: "Stored procedure name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleStoredProcedureTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (toolName === "list_stored_procedures") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT ROUTINE_SCHEMA, ROUTINE_NAME, CREATED, LAST_ALTERED
           FROM INFORMATION_SCHEMA.ROUTINES
           WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_SCHEMA = @schema
           ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`
        : `SELECT ROUTINE_SCHEMA, ROUTINE_NAME, CREATED, LAST_ALTERED
           FROM INFORMATION_SCHEMA.ROUTINES
           WHERE ROUTINE_TYPE = 'PROCEDURE'
           ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (toolName === "get_stored_procedure_definition") {
      const { schema, name, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      // sys.sql_modules stores the full definition without the 4000-char INFORMATION_SCHEMA limit
      const rows = await sqlQuery(
        `SELECT m.definition
         FROM sys.objects o
         JOIN sys.sql_modules m ON o.object_id = m.object_id
         JOIN sys.schemas s ON o.schema_id = s.schema_id
         WHERE s.name = @schema AND o.name = @name
           AND o.type IN ('P', 'PC')`,
        [
          { name: "schema", value: schema },
          { name: "name", value: name },
        ],
        database
      );
      if (rows.length === 0) {
        return errorResult(`Stored procedure '${schema}.${name}' not found.`);
      }
      return textResult({ definition: rows[0].definition });
    }

    return errorResult(`Unknown tool: ${toolName}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
