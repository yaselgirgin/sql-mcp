import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const sequenceTools: Tool[] = [
  {
    name: "list_sequences",
    description:
      "List all sequences in a database, optionally filtered by schema. Shows data type, range, increment, cycling, and current value.",
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

export async function handleSequenceTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_sequences") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT
             SCHEMA_NAME(seq.schema_id) AS sequence_schema,
             seq.name AS sequence_name,
             TYPE_NAME(seq.user_type_id) AS data_type,
             CAST(seq.start_value AS NVARCHAR(MAX)) AS start_value,
             CAST(seq.increment AS NVARCHAR(MAX)) AS increment,
             CAST(seq.minimum_value AS NVARCHAR(MAX)) AS minimum_value,
             CAST(seq.maximum_value AS NVARCHAR(MAX)) AS maximum_value,
             seq.is_cycling,
             seq.is_cached,
             seq.cache_size,
             CAST(seq.current_value AS NVARCHAR(MAX)) AS current_value
           FROM sys.sequences seq
           WHERE SCHEMA_NAME(seq.schema_id) = @schema
           ORDER BY sequence_schema, sequence_name`
        : `SELECT
             SCHEMA_NAME(seq.schema_id) AS sequence_schema,
             seq.name AS sequence_name,
             TYPE_NAME(seq.user_type_id) AS data_type,
             CAST(seq.start_value AS NVARCHAR(MAX)) AS start_value,
             CAST(seq.increment AS NVARCHAR(MAX)) AS increment,
             CAST(seq.minimum_value AS NVARCHAR(MAX)) AS minimum_value,
             CAST(seq.maximum_value AS NVARCHAR(MAX)) AS maximum_value,
             seq.is_cycling,
             seq.is_cached,
             seq.cache_size,
             CAST(seq.current_value AS NVARCHAR(MAX)) AS current_value
           FROM sys.sequences seq
           ORDER BY sequence_schema, sequence_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
