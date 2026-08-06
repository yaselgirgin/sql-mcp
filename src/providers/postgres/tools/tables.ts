import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const tableTools: Tool[] = [
  {
    name: "list_tables",
    description: "List all base tables in a database, optionally filtered by schema",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database name" },
        schema: { type: "string", description: "Schema name filter (e.g. public)" },
      },
    },
  },
  {
    name: "describe_table",
    description: "Get column definitions for a table including data types, nullability, and defaults",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (e.g. public)" },
        table: { type: "string", description: "Table name" },
        database: { type: "string", description: "Database name" },
      },
      required: ["schema", "table"],
    },
  },
  {
    name: "get_table_indexes",
    description: "List indexes on a table",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name" },
        table: { type: "string", description: "Table name" },
        database: { type: "string", description: "Database name" },
      },
      required: ["schema", "table"],
    },
  },
  {
    name: "get_foreign_keys",
    description: "List foreign key constraints on a table",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name" },
        table: { type: "string", description: "Table name" },
        database: { type: "string", description: "Database name" },
      },
      required: ["schema", "table"],
    },
  },
];

export async function handleTableTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_tables") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT table_schema, table_name,
                  pg_size_pretty(pg_total_relation_size(quote_ident(table_schema)||'.'||quote_ident(table_name))) AS total_size,
                  obj_description(
                    (quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass, 'pg_class'
                  ) AS description
           FROM information_schema.tables
           WHERE table_type = 'BASE TABLE'
             AND table_schema NOT IN ('pg_catalog','information_schema')
             AND table_schema = $1
           ORDER BY table_schema, table_name`
        : `SELECT table_schema, table_name,
                  pg_size_pretty(pg_total_relation_size(quote_ident(table_schema)||'.'||quote_ident(table_name))) AS total_size,
                  obj_description(
                    (quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass, 'pg_class'
                  ) AS description
           FROM information_schema.tables
           WHERE table_type = 'BASE TABLE'
             AND table_schema NOT IN ('pg_catalog','information_schema')
           ORDER BY table_schema, table_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "describe_table") {
      const { schema, table, database } = args as {
        schema: string; table: string; database?: string;
      };
      const rows = await sqlQuery(
        `SELECT column_name, ordinal_position, data_type,
                character_maximum_length, numeric_precision, numeric_scale,
                is_nullable, column_default,
                col_description(
                  (quote_ident($1)||'.'||quote_ident($2))::regclass,
                  ordinal_position
                ) AS description
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [{ name: "schema", value: schema }, { name: "table", value: table }],
        database
      );
      if (rows.length === 0) return errorResult(`Table '${schema}.${table}' not found.`);
      return textResult(rows);
    }

    if (name === "get_table_indexes") {
      const { schema, table, database } = args as {
        schema: string; table: string; database?: string;
      };
      const rows = await sqlQuery(
        `SELECT i.relname AS index_name,
                ix.indisunique AS is_unique,
                ix.indisprimary AS is_primary,
                am.amname AS index_type,
                array_to_string(array_agg(a.attname ORDER BY k.n), ', ') AS columns,
                pg_get_indexdef(ix.indexrelid) AS definition
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_am am ON am.oid = i.relam
         JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n) ON true
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
         WHERE n.nspname = $1 AND t.relname = $2
         GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, ix.indexrelid
         ORDER BY ix.indisprimary DESC, i.relname`,
        [{ name: "schema", value: schema }, { name: "table", value: table }],
        database
      );
      return textResult(rows);
    }

    if (name === "get_foreign_keys") {
      const { schema, table, database } = args as {
        schema: string; table: string; database?: string;
      };
      const rows = await sqlQuery(
        `SELECT tc.constraint_name,
                kcu.column_name,
                ccu.table_schema AS foreign_schema,
                ccu.table_name AS foreign_table,
                ccu.column_name AS foreign_column,
                rc.update_rule,
                rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.referential_constraints rc
           ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON rc.unique_constraint_name = ccu.constraint_name
          AND rc.unique_constraint_schema = ccu.constraint_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = $1 AND tc.table_name = $2
         ORDER BY tc.constraint_name, kcu.ordinal_position`,
        [{ name: "schema", value: schema }, { name: "table", value: table }],
        database
      );
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
