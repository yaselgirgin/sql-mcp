import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const tableTools: Tool[] = [
  {
    name: "list_tables",
    description: "List all tables in a database, optionally filtered by schema",
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
    name: "describe_table",
    description: "Get column definitions for a table",
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
  {
    name: "get_table_indexes",
    description: "Get all indexes defined on a table",
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
  {
    name: "get_foreign_keys",
    description: "Get all foreign key relationships for a table",
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

export async function handleTableTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_tables") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schema
           ORDER BY TABLE_SCHEMA, TABLE_NAME`
        : `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_SCHEMA, TABLE_NAME`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    if (name === "describe_table") {
      const { schema, table, database } = args as {
        schema: string;
        table: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           c.COLUMN_NAME,
           c.ORDINAL_POSITION,
           c.DATA_TYPE,
           c.CHARACTER_MAXIMUM_LENGTH,
           c.NUMERIC_PRECISION,
           c.NUMERIC_SCALE,
           c.IS_NULLABLE,
           c.COLUMN_DEFAULT
         FROM INFORMATION_SCHEMA.COLUMNS c
         WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
         ORDER BY c.ORDINAL_POSITION`,
        [
          { name: "schema", value: schema },
          { name: "table", value: table },
        ],
        database
      );
      return textResult(rows);
    }

    if (name === "get_table_indexes") {
      const { schema, table, database } = args as {
        schema: string;
        table: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           i.name AS index_name,
           i.type_desc AS index_type,
           i.is_unique,
           i.is_primary_key,
           STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
         FROM sys.indexes i
         JOIN sys.index_columns ic
           ON i.object_id = ic.object_id AND i.index_id = ic.index_id
         JOIN sys.columns c
           ON ic.object_id = c.object_id AND ic.column_id = c.column_id
         JOIN sys.tables t ON i.object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE s.name = @schema AND t.name = @table AND ic.is_included_column = 0
         GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
         ORDER BY i.is_primary_key DESC, i.name`,
        [
          { name: "schema", value: schema },
          { name: "table", value: table },
        ],
        database
      );
      return textResult(rows);
    }

    if (name === "get_foreign_keys") {
      const { schema, table, database } = args as {
        schema: string;
        table: string;
        database?: string;
      };
      const rows = await sqlQuery(
        `SELECT
           fk.name AS constraint_name,
           tp.name AS parent_table,
           sp.name AS parent_schema,
           cp.name AS parent_column,
           tr.name AS referenced_table,
           sr.name AS referenced_schema,
           cr.name AS referenced_column,
           fk.delete_referential_action_desc,
           fk.update_referential_action_desc
         FROM sys.foreign_keys fk
         JOIN sys.foreign_key_columns fkc
           ON fk.object_id = fkc.constraint_object_id
         JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
         JOIN sys.schemas sp ON tp.schema_id = sp.schema_id
         JOIN sys.columns cp
           ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
         JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
         JOIN sys.schemas sr ON tr.schema_id = sr.schema_id
         JOIN sys.columns cr
           ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
         WHERE sp.name = @schema AND tp.name = @table
         ORDER BY fk.name, fkc.constraint_column_id`,
        [
          { name: "schema", value: schema },
          { name: "table", value: table },
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
