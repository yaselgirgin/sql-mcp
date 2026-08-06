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
           STRING_AGG(CAST(prv.value AS NVARCHAR(MAX)), ', ')
             WITHIN GROUP (ORDER BY prv.boundary_id) AS boundary_values,
           pf.create_date,
           pf.modify_date
         FROM sys.partition_functions pf
         LEFT JOIN sys.partition_range_values prv ON pf.function_id = prv.function_id
         GROUP BY pf.name, pf.type_desc, pf.boundary_value_on_right, pf.fanout,
           pf.create_date, pf.modify_date
         ORDER BY pf.name`
      );
      return textResult(rows);
    }

    if (name === "list_partition_schemes") {
      const rows = await sqlQuery(
        `SELECT
           ps.name AS scheme_name,
           pf.name AS function_name,
           STRING_AGG(fg.name, ', ') WITHIN GROUP (ORDER BY dds.destination_id) AS filegroups
         FROM sys.partition_schemes ps
         JOIN sys.partition_functions pf ON ps.function_id = pf.function_id
         JOIN sys.destination_data_spaces dds ON ps.data_space_id = dds.partition_scheme_id
         JOIN sys.filegroups fg ON dds.data_space_id = fg.data_space_id
         GROUP BY ps.name, pf.name
         ORDER BY ps.name`
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
