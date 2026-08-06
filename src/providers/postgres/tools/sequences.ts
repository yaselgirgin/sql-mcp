import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const sequenceTools: Tool[] = [
  {
    name: "list_sequences",
    description: "List all sequences in a database, optionally filtered by schema",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
        schema: { type: "string", description: "Schema name filter" },
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
        ? `SELECT s.sequence_schema,
                  s.sequence_name,
                  s.data_type,
                  s.start_value,
                  s.minimum_value,
                  s.maximum_value,
                  s.increment,
                  s.cycle_option,
                  pg_sequence.seqcache AS cache_size,
                  (SELECT last_value FROM pg_sequences ps
                   WHERE ps.schemaname = s.sequence_schema
                     AND ps.sequencename = s.sequence_name) AS last_value
           FROM information_schema.sequences s
           JOIN pg_class c ON c.relname = s.sequence_name
           JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.sequence_schema
           JOIN pg_sequence ON pg_sequence.seqrelid = c.oid
           WHERE s.sequence_schema = $1
           ORDER BY s.sequence_schema, s.sequence_name`
        : `SELECT s.sequence_schema,
                  s.sequence_name,
                  s.data_type,
                  s.start_value,
                  s.minimum_value,
                  s.maximum_value,
                  s.increment,
                  s.cycle_option,
                  pg_sequence.seqcache AS cache_size,
                  (SELECT last_value FROM pg_sequences ps
                   WHERE ps.schemaname = s.sequence_schema
                     AND ps.sequencename = s.sequence_name) AS last_value
           FROM information_schema.sequences s
           JOIN pg_class c ON c.relname = s.sequence_name
           JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.sequence_schema
           JOIN pg_sequence ON pg_sequence.seqrelid = c.oid
           ORDER BY s.sequence_schema, s.sequence_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
