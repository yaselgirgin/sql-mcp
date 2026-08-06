import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const synonymTools: Tool[] = [
  {
    name: "list_synonyms",
    description: "List all synonyms in a database, optionally filtered by schema",
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
    name: "get_synonym_definition",
    description: "Get the base object a synonym points to",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        name: { type: "string", description: "Synonym name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleSynonymTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (toolName === "list_synonyms") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT
             SCHEMA_NAME(sy.schema_id) AS synonym_schema,
             sy.name AS synonym_name,
             sy.base_object_name
           FROM sys.synonyms sy
           WHERE SCHEMA_NAME(sy.schema_id) = @schema
           ORDER BY synonym_schema, synonym_name`
        : `SELECT
             SCHEMA_NAME(sy.schema_id) AS synonym_schema,
             sy.name AS synonym_name,
             sy.base_object_name
           FROM sys.synonyms sy
           ORDER BY synonym_schema, synonym_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (toolName === "get_synonym_definition") {
      const { schema, name, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           SCHEMA_NAME(sy.schema_id) AS synonym_schema,
           sy.name AS synonym_name,
           sy.base_object_name,
           sy.create_date,
           sy.modify_date
         FROM sys.synonyms sy
         WHERE SCHEMA_NAME(sy.schema_id) = @schema AND sy.name = @name`,
        [
          { name: "schema", value: schema },
          { name: "name", value: name },
        ],
        database
      );
      if (rows.length === 0) {
        return errorResult(`Synonym '${schema}.${name}' not found.`);
      }
      return textResult(rows[0]);
    }

    return errorResult(`Unknown tool: ${toolName}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
