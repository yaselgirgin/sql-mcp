import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const extendedPropertyTools: Tool[] = [
  {
    name: "get_extended_properties",
    description:
      "Get all extended properties (e.g. MS_Description documentation) for a table, view, procedure, or function — includes both the object-level and all column-level properties",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        name: {
          type: "string",
          description: "Object name (table, view, stored procedure, function, etc.)",
        },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleExtendedPropertyTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "get_extended_properties") {
      const { schema, name: objectName, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           ep.name AS property_name,
           CAST(ep.value AS NVARCHAR(MAX)) AS property_value,
           CASE ep.minor_id WHEN 0 THEN 'object' ELSE 'column' END AS scope,
           ISNULL(c.name, '') AS column_name
         FROM sys.extended_properties ep
         JOIN sys.objects o ON ep.major_id = o.object_id
         JOIN sys.schemas s ON o.schema_id = s.schema_id
         LEFT JOIN sys.columns c
           ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
         WHERE ep.class = 1
           AND s.name = @schema
           AND o.name = @name
         ORDER BY ep.minor_id, ep.name`,
        [
          { name: "schema", value: schema },
          { name: "name", value: objectName },
        ],
        database
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
