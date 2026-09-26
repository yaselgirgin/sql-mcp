import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const partitioningTools: Tool[] = [
  {
    name: "list_partition_functions",
    description:
      "List all partition functions in the current database, including range type, partition count, and boundary values",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_partition_schemes",
    description:
      "List all partition schemes in the current database, showing which partition function each uses and the mapped filegroups",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handlePartitioningTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_partition_functions") {
      const rows = await sqlQuery(
        `SELECT
           pf.name AS function_name,
           pf.type_desc,
           CASE pf.boundary_value_on_right WHEN 1 THEN 'RIGHT' ELSE 'LEFT' END AS range_type,
           pf.fanout AS partition_count,
           STUFF((
             SELECT ', ' + CAST(prv2.value AS NVARCHAR(MAX))
             FROM sys.partition_range_values prv2
             WHERE prv2.function_id = pf.function_id
             ORDER BY prv2.boundary_id
             FOR XML PATH(''), TYPE
           ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS boundary_values,
           pf.create_date,
           pf.modify_date
         FROM sys.partition_functions pf
         ORDER BY pf.name`
      );
      return textResult(rows);
    }

    if (name === "list_partition_schemes") {
      const rows = await sqlQuery(
        `SELECT
           ps.name AS scheme_name,
           pf.name AS function_name,
           STUFF((
             SELECT ', ' + fg2.name
             FROM sys.destination_data_spaces dds2
             JOIN sys.filegroups fg2 ON dds2.data_space_id = fg2.data_space_id
             WHERE dds2.partition_scheme_id = ps.data_space_id
             ORDER BY dds2.destination_id
             FOR XML PATH(''), TYPE
           ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS filegroups
         FROM sys.partition_schemes ps
         JOIN sys.partition_functions pf ON ps.function_id = pf.function_id
         ORDER BY ps.name`
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
