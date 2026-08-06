import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const agentJobTools: Tool[] = [
  {
    name: "list_agent_jobs",
    description:
      "List all SQL Server Agent jobs with their enabled state, category, owner, and last run outcome. " +
      "Requires membership in SQLAgentUserRole (or higher) in the msdb database.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_job_history",
    description:
      "Get execution history for a SQL Server Agent job. " +
      "Requires membership in SQLAgentUserRole (or higher) in the msdb database.",
    inputSchema: {
      type: "object",
      properties: {
        job_name: { type: "string", description: "Exact job name" },
        top: {
          type: "number",
          description: "Number of most-recent history entries to return (default: 50, max: 500)",
        },
      },
      required: ["job_name"],
    },
  },
];

export async function handleAgentJobTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_agent_jobs") {
      const rows = await sqlQuery(
        `SELECT
           j.name AS job_name,
           j.description,
           j.enabled,
           j.date_created,
           j.date_modified,
           c.name AS category_name,
           SUSER_SNAME(j.owner_sid) AS owner_name,
           jh.run_date AS last_run_date,
           jh.run_time AS last_run_time,
           CASE jh.run_status
             WHEN 0 THEN 'Failed'
             WHEN 1 THEN 'Succeeded'
             WHEN 2 THEN 'Retry'
             WHEN 3 THEN 'Cancelled'
             ELSE 'Unknown'
           END AS last_run_status,
           jh.message AS last_run_message
         FROM msdb.dbo.sysjobs j
         LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
         OUTER APPLY (
           SELECT TOP 1 run_date, run_time, run_status, message
           FROM msdb.dbo.sysjobhistory
           WHERE job_id = j.job_id AND step_id = 0
           ORDER BY run_date DESC, run_time DESC
         ) jh
         ORDER BY j.name`
      );
      return textResult(rows);
    }

    if (name === "get_job_history") {
      const { job_name, top } = args as { job_name: string; top?: number };
      const limit = Math.min(typeof top === "number" ? top : 50, 500);
      const rows = await sqlQuery(
        `SELECT TOP (${limit})
           j.name AS job_name,
           h.step_id,
           h.step_name,
           CASE h.run_status
             WHEN 0 THEN 'Failed'
             WHEN 1 THEN 'Succeeded'
             WHEN 2 THEN 'Retry'
             WHEN 3 THEN 'Cancelled'
             WHEN 4 THEN 'In Progress'
             ELSE 'Unknown'
           END AS run_status,
           msdb.dbo.agent_datetime(h.run_date, h.run_time) AS run_datetime,
           h.run_duration AS duration_hhmmss,
           h.message
         FROM msdb.dbo.sysjobhistory h
         JOIN msdb.dbo.sysjobs j ON h.job_id = j.job_id
         WHERE j.name = @job_name
         ORDER BY h.run_date DESC, h.run_time DESC`,
        [{ name: "job_name", value: job_name }]
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
