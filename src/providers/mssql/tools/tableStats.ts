import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const tableStatsTools: Tool[] = [
  {
    name: "get_table_stats",
    description:
      "Get row count and disk space usage (total, used, unused) for a table",
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

export async function handleTableStatsTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "get_table_stats") {
      const { schema, table, database } = args as {
        schema: string;
        table: string;
        database?: string;
      };
      const inputs = [
        { name: "schema", value: schema },
        { name: "table", value: table },
      ];

      const [rowResult, spaceResult] = await Promise.all([
        sqlQuery(
          `SELECT SUM(p.rows) AS row_count
           FROM sys.partitions p
           JOIN sys.tables t ON p.object_id = t.object_id
           JOIN sys.schemas s ON t.schema_id = s.schema_id
           WHERE s.name = @schema AND t.name = @table
             AND p.index_id IN (0, 1)`,
          inputs,
          database
        ),
        sqlQuery(
          `SELECT
             CAST(SUM(a.total_pages) * 8.0 / 1024 AS DECIMAL(18,2)) AS total_space_mb,
             CAST(SUM(a.used_pages) * 8.0 / 1024 AS DECIMAL(18,2)) AS used_space_mb,
             CAST((SUM(a.total_pages) - SUM(a.used_pages)) * 8.0 / 1024 AS DECIMAL(18,2)) AS unused_space_mb
           FROM sys.indexes i
           JOIN sys.tables t ON i.object_id = t.object_id
           JOIN sys.schemas s ON t.schema_id = s.schema_id
           JOIN sys.partitions p
             ON i.object_id = p.object_id AND i.index_id = p.index_id
           JOIN sys.allocation_units a ON p.hobt_id = a.container_id
           WHERE s.name = @schema AND t.name = @table`,
          inputs,
          database
        ),
      ]);

      return textResult({
        schema,
        table,
        row_count: rowResult[0]?.row_count ?? 0,
        ...(spaceResult[0] ?? { total_space_mb: 0, used_space_mb: 0, unused_space_mb: 0 }),
      });
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
