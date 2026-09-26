import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sqlQuery, textResult, errorResult } from "../client.js";
import type { CallToolResult } from "../client.js";

export const fullTextTools: Tool[] = [
  {
    name: "list_fulltext_catalogs",
    description:
      "List all full-text search catalogs in a database with item count, size, and populate status",
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
    name: "list_fulltext_indexes",
    description:
      "List all full-text indexes in a database, showing the catalog, indexed columns, and change-tracking state",
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
];

export async function handleFullTextTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    if (name === "list_fulltext_catalogs") {
      const { database } = args as { database?: string };
      const rows = await sqlQuery(
        `SELECT
           name AS catalog_name,
           is_default,
           is_accent_sensitivity_on,
           FULLTEXTCATALOGPROPERTY(name, 'ItemCount') AS item_count,
           FULLTEXTCATALOGPROPERTY(name, 'SizeInMB') AS size_mb,
           FULLTEXTCATALOGPROPERTY(name, 'PopulateStatus') AS populate_status
         FROM sys.fulltext_catalogs
         ORDER BY name`,
        [],
        database
      );
      return textResult(rows);
    }

    if (name === "list_fulltext_indexes") {
      const { database, schema } = args as { database?: string; schema?: string };
      const query = schema
        ? `SELECT
             SCHEMA_NAME(t.schema_id) AS table_schema,
             t.name AS table_name,
             fc.name AS catalog_name,
             fi.is_enabled,
             fi.change_tracking_state_desc,
             STUFF((
               SELECT ', ' + c2.name
               FROM sys.fulltext_index_columns fic2
               JOIN sys.columns c2
                 ON fic2.object_id = c2.object_id AND fic2.column_id = c2.column_id
               WHERE fic2.object_id = fi.object_id
               ORDER BY c2.name
               FOR XML PATH(''), TYPE
             ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS indexed_columns
           FROM sys.fulltext_indexes fi
           JOIN sys.tables t ON fi.object_id = t.object_id
           JOIN sys.fulltext_catalogs fc ON fi.fulltext_catalog_id = fc.fulltext_catalog_id
           WHERE SCHEMA_NAME(t.schema_id) = @schema
           ORDER BY table_schema, table_name`
        : `SELECT
             SCHEMA_NAME(t.schema_id) AS table_schema,
             t.name AS table_name,
             fc.name AS catalog_name,
             fi.is_enabled,
             fi.change_tracking_state_desc,
             STUFF((
               SELECT ', ' + c2.name
               FROM sys.fulltext_index_columns fic2
               JOIN sys.columns c2
                 ON fic2.object_id = c2.object_id AND fic2.column_id = c2.column_id
               WHERE fic2.object_id = fi.object_id
               ORDER BY c2.name
               FOR XML PATH(''), TYPE
             ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS indexed_columns
           FROM sys.fulltext_indexes fi
           JOIN sys.tables t ON fi.object_id = t.object_id
           JOIN sys.fulltext_catalogs fc ON fi.fulltext_catalog_id = fc.fulltext_catalog_id
           ORDER BY table_schema, table_name`;
      const inputs = schema ? [{ name: "schema", value: schema }] : [];
      const rows = await sqlQuery(query, inputs, database);
      return textResult(rows);
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : String(e));
  }
}
