import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const serverPropertyTools: Tool[] = [
  {
    name: "get_server_properties",
    description:
      "Get SQL Server instance properties: version, edition, collation, clustering, and authentication configuration",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleServerPropertyTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "get_server_properties") {
      const rows = await sqlQuery(
        `SELECT
           @@SERVERNAME AS server_name,
           SERVERPROPERTY('ProductVersion') AS product_version,
           SERVERPROPERTY('ProductLevel') AS product_level,
           SERVERPROPERTY('Edition') AS edition,
           SERVERPROPERTY('EngineEdition') AS engine_edition,
           SERVERPROPERTY('Collation') AS server_collation,
           SERVERPROPERTY('IsClustered') AS is_clustered,
           SERVERPROPERTY('IsIntegratedSecurityOnly') AS windows_auth_only,
           SERVERPROPERTY('ComputerNamePhysicalNetBIOS') AS computer_name,
           @@VERSION AS version_string`
      );
      return textResult(rows[0]);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
