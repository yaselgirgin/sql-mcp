import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const triggerTools: Tool[] = [
  {
    name: "list_triggers",
    description: "List all triggers in a database, optionally filtered by schema or table",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
        schema: { type: "string", description: "Schema name filter" },
        table: { type: "string", description: "Table name filter" },
      },
    },
  },
  {
    name: "get_trigger_definition",
    description: "Get the definition SQL for a trigger",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema of the parent table" },
        name: { type: "string", description: "Trigger name" },
        database: { type: "string", description: "Database name" },
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
        database?: string; schema?: string; table?: string;
      };

      const conditions: string[] = [
        `t.trigger_schema NOT IN ('pg_catalog','information_schema')`,
      ];
      const inputs: { name: string; value: string }[] = [];

      if (schema) {
        inputs.push({ name: "schema", value: schema });
        conditions.push(`t.trigger_schema = $${inputs.length}`);
      }
      if (table) {
        inputs.push({ name: "table", value: table });
        conditions.push(`t.event_object_table = $${inputs.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await sqlQuery(
        `SELECT t.trigger_schema,
                t.event_object_table AS table_name,
                t.trigger_name,
                t.event_manipulation,
                t.action_timing,
                t.action_orientation,
                t.action_condition,
                t.action_statement
         FROM information_schema.triggers t
         ${where}
         ORDER BY t.trigger_schema, t.event_object_table, t.trigger_name`,
        inputs,
        database
      );
      return textResult(rows);
    }

    if (name === "get_trigger_definition") {
      const { schema, name: triggerName, database } = args as {
        schema: string; name: string; database?: string;
      };
      const rows = await sqlQuery(
        `SELECT t.trigger_name,
                t.event_object_table AS table_name,
                pg_get_triggerdef(pg_trigger.oid, true) AS definition
         FROM information_schema.triggers t
         JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name
         JOIN pg_class c ON pg_trigger.tgrelid = c.oid
         JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE t.trigger_schema = $1 AND t.trigger_name = $2
         LIMIT 1`,
        [{ name: "schema", value: schema }, { name: "name", value: triggerName }],
        database
      );
      if (rows.length === 0) return errorResult(`Trigger '${triggerName}' not found in schema '${schema}'.`);
      return textResult(rows[0]);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
