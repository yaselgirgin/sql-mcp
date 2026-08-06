import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const securityTools: Tool[] = [
  {
    name: "list_database_users",
    description: "List all users in a database with their type, default schema, and mapped login",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
    },
  },
  {
    name: "list_database_roles",
    description:
      "List all database roles and their members. Uses LEFT JOIN so roles with no members are included.",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
    },
  },
  {
    name: "get_object_permissions",
    description: "Get all explicit permissions granted on a specific database object",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. dbo)" },
        name: { type: "string", description: "Object name (table, view, procedure, etc.)" },
        database: {
          type: "string",
          description: "Database name (defaults to the configured default database)",
        },
      },
      required: ["schema", "name"],
    },
  },
];

export async function handleSecurityTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_database_users") {
      const { database } = args as { database?: string };
      const rows = await sqlQuery(
        `SELECT
           dp.name AS user_name,
           dp.type_desc AS user_type,
           dp.default_schema_name,
           sl.name AS login_name,
           dp.create_date,
           dp.modify_date
         FROM sys.database_principals dp
         LEFT JOIN sys.server_principals sl ON dp.sid = sl.sid
         WHERE dp.type NOT IN ('R', 'A')
           AND dp.name NOT IN ('sys', 'INFORMATION_SCHEMA')
         ORDER BY dp.name`,
        [],
        database
      );
      return textResult(rows);
    }

    if (name === "list_database_roles") {
      const { database } = args as { database?: string };
      const rows = await sqlQuery(
        `SELECT
           r.name AS role_name,
           r.is_fixed_role,
           m.name AS member_name,
           m.type_desc AS member_type
         FROM sys.database_principals r
         LEFT JOIN sys.database_role_members drm
           ON r.principal_id = drm.role_principal_id
         LEFT JOIN sys.database_principals m
           ON drm.member_principal_id = m.principal_id
         WHERE r.type = 'R'
         ORDER BY r.name, m.name`,
        [],
        database
      );
      return textResult(rows);
    }

    if (name === "get_object_permissions") {
      const { schema, name: objectName, database } = args as {
        schema: string;
        name: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           dp.permission_name,
           dp.state_desc AS permission_state,
           pr.name AS grantee,
           pr.type_desc AS grantee_type,
           g.name AS grantor
         FROM sys.database_permissions dp
         JOIN sys.database_principals pr
           ON dp.grantee_principal_id = pr.principal_id
         JOIN sys.database_principals g
           ON dp.grantor_principal_id = g.principal_id
         JOIN sys.objects o ON dp.major_id = o.object_id
         JOIN sys.schemas s ON o.schema_id = s.schema_id
         WHERE dp.class_desc = 'OBJECT_OR_COLUMN'
           AND s.name = @schema
           AND o.name = @name
         ORDER BY pr.name, dp.permission_name`,
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
