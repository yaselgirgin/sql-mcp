import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const serviceBrokerTools: Tool[] = [
  {
    name: "list_service_queues",
    description:
      "List all Service Broker queues in a database, optionally filtered by schema",
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
    name: "list_broker_services",
    description: "List all Service Broker services in a database and the queue each binds to",
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
];

export async function handleServiceBrokerTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_service_queues") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT
             SCHEMA_NAME(sq.schema_id) AS queue_schema,
             sq.name AS queue_name,
             sq.is_enqueue_enabled,
             sq.is_receive_enabled,
             sq.is_activation_enabled,
             sq.activation_procedure,
             sq.max_readers,
             sq.is_retention_enabled
           FROM sys.service_queues sq
           WHERE SCHEMA_NAME(sq.schema_id) = @schema
           ORDER BY queue_schema, queue_name`
        : `SELECT
             SCHEMA_NAME(sq.schema_id) AS queue_schema,
             sq.name AS queue_name,
             sq.is_enqueue_enabled,
             sq.is_receive_enabled,
             sq.is_activation_enabled,
             sq.activation_procedure,
             sq.max_readers,
             sq.is_retention_enabled
           FROM sys.service_queues sq
           ORDER BY queue_schema, queue_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "list_broker_services") {
      const { database } = args as { database?: string };
      const rows = await sqlQuery(
        `SELECT
           s.name AS service_name,
           OBJECT_SCHEMA_NAME(s.service_queue_id) AS queue_schema,
           OBJECT_NAME(s.service_queue_id) AS queue_name,
           s.create_date,
           s.modify_date
         FROM sys.services s
         ORDER BY s.name`,
        [],
        database
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
