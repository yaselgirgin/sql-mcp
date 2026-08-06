import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, validateReadOnly, textResult, errorResult } from "../client.js";
import { getPolicy, checkQueryPolicy } from "../../../core/policy.js";
import type { CallToolResult } from "../client.js";

const DEFAULT_MAX_ROWS = 1000;

export const queryTools: Tool[] = [
  {
    name: "execute_query",
    description:
      "Execute a read-only SELECT query against the PostgreSQL database. " +
      "Only SELECT statements (and CTEs using WITH) are permitted. " +
      "Use LIMIT in your query for large tables. " +
      `Results are capped at ${DEFAULT_MAX_ROWS} rows by default.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The SELECT query to execute",
        },
        database: {
          type: "string",
          description: "Database to run the query against (defaults to configured default)",
        },
        max_rows: {
          type: "number",
          description: `Maximum rows to return (default: ${DEFAULT_MAX_ROWS}, max: 5000)`,
        },
      },
      required: ["query"],
    },
  },
];

export async function handleQueryTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "execute_query") {
      const { query, database, max_rows } = args as {
        query: string;
        database?: string;
        max_rows?: number;
      };

      const validation = validateReadOnly(query);
      if (!validation.valid) return errorResult(validation.error!);

      const policyCheck = checkQueryPolicy(query);
      if (!policyCheck.allowed) return errorResult(policyCheck.reason);

      const policy = getPolicy();
      const limit = Math.min(max_rows ?? DEFAULT_MAX_ROWS, policy.maxRows);
      const rows = await sqlQuery(query, [], database);
      const trimmed = rows.slice(0, limit);

      return textResult({
        rows: trimmed,
        row_count: trimmed.length,
        truncated: trimmed.length < rows.length,
      });
    }
    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
