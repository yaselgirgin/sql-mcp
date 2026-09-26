import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const triggerTools: Tool[] = [
  {
    name: "list_triggers",
    description:
      "List all DML triggers in a database, optionally filtered by schema and/or parent table",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
        schema: {
          type: "string",
          description: "Filter by parent table schema (e.g. dbo)",
        },
        table: {
          type: "string",
          description: "Filter by parent table name",
        },
      },
    },
  },
  {
    name: "get_trigger_definition",
    description: "Get the full source definition of a DML trigger",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Schema of the parent table the trigger belongs to (e.g. dbo)",
        },
        name: { type: "string", description: "Trigger name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleTriggerTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_triggers") {
      const { database, schema, table } = args as {
        database?: string;
        schema?: string;
        table?: string;
      };

      const conditions: string[] = ["t.parent_class = 1"];
      const inputs: { name: string; value: string }[] = [];

      if (schema) {
        conditions.push("OBJECT_SCHEMA_NAME(t.parent_id) = @schema");
        inputs.push({ name: "schema", value: schema });
      }
      if (table) {
        conditions.push("OBJECT_NAME(t.parent_id) = @table");
        inputs.push({ name: "table", value: table });
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const rows = await sqlQuery(
        `SELECT
           t.name AS trigger_name,
           OBJECT_SCHEMA_NAME(t.parent_id) AS parent_schema,
           OBJECT_NAME(t.parent_id) AS parent_table,
           t.type_desc,
           t.is_disabled,
           t.is_instead_of_trigger,
           STUFF((
             SELECT ', ' + te2.type_desc
             FROM sys.trigger_events te2
             WHERE te2.object_id = t.object_id
             ORDER BY te2.type_desc
             FOR XML PATH(''), TYPE
           ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS events,
           t.create_date,
           t.modify_date
         FROM sys.triggers t
         ${where}
         ORDER BY parent_schema, parent_table, trigger_name`,
        inputs,
        database
      );
      return textResult(rows);
    }

    if (name === "get_trigger_definition") {
      const { schema, name: triggerName, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT m.definition
         FROM sys.triggers t
         JOIN sys.sql_modules m ON t.object_id = m.object_id
         WHERE t.name = @name
           AND OBJECT_SCHEMA_NAME(t.parent_id) = @schema
           AND t.parent_class = 1`,
        [
          { name: "schema", value: schema },
          { name: "name", value: triggerName },
        ],
        database
      );
      if (rows.length === 0) {
        return errorResult(`Trigger '${triggerName}' on schema '${schema}' not found.`);
      }
      return textResult(rows[0]);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
