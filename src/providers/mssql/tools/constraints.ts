import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const constraintTools: Tool[] = [
  {
    name: "get_table_constraints",
    description:
      "Get all constraints on a table: PRIMARY KEY, UNIQUE, CHECK, and DEFAULT",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        table: { type: "string", description: "Table name" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "table"],
    },
  },
];

export async function handleConstraintTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "get_table_constraints") {
      const { schema, table, database } = args as {
        schema: string;
        table: string;
        database?: string;
      };
      const inputs = [
        { name: "schema", value: schema },
        { name: "table", value: table },
      ];

      const rows = await sqlQuery(
        `-- PRIMARY KEY and UNIQUE key constraints
         SELECT
           kc.name AS constraint_name,
           kc.type_desc AS constraint_type,
           STUFF((
             SELECT ', ' + c2.name
             FROM sys.index_columns ic2
             JOIN sys.columns c2
               ON ic2.object_id = c2.object_id AND ic2.column_id = c2.column_id
             WHERE ic2.object_id = kc.parent_object_id
               AND ic2.index_id = kc.unique_index_id
               AND ic2.is_included_column = 0
             ORDER BY ic2.key_ordinal
             FOR XML PATH(''), TYPE
           ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS columns,
           NULL AS definition
         FROM sys.key_constraints kc
         JOIN sys.tables t ON kc.parent_object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE s.name = @schema AND t.name = @table

         UNION ALL

         -- CHECK constraints
         SELECT
           cc.name AS constraint_name,
           'CHECK' AS constraint_type,
           NULL AS columns,
           cc.definition
         FROM sys.check_constraints cc
         JOIN sys.tables t ON cc.parent_object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE s.name = @schema AND t.name = @table

         UNION ALL

         -- DEFAULT constraints
         SELECT
           dc.name AS constraint_name,
           'DEFAULT' AS constraint_type,
           c.name AS columns,
           dc.definition
         FROM sys.default_constraints dc
         JOIN sys.tables t ON dc.parent_object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.columns c
           ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
         WHERE s.name = @schema AND t.name = @table

         ORDER BY constraint_type, constraint_name`,
        inputs,
        database
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
