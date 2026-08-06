// Policy enforcement for data privacy.
// This module intentionally does NOT import from client.ts to avoid circular dependencies.

export interface Policy {
  /** null = all schemas allowed */
  allowedSchemas: Set<string> | null;
  /** "schema.table" lowercase */
  blockedTables: Set<string>;
  /** "schema.table.column" lowercase → mask replacement value */
  maskedColumns: Map<string, string>;
  /** hard row cap */
  maxRows: number;
}

let _policy: Policy | null = null;

function parseCsvSet(raw: string | undefined): Set<string> | null {
  if (!raw || raw.trim() === "") return null;
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function loadPolicy(): Policy {
  const allowedSchemas = parseCsvSet(process.env.SQL_ALLOWED_SCHEMAS);
  const blockedTablesRaw = parseCsvSet(process.env.SQL_BLOCKED_TABLES);
  const maskedColumnsRaw = parseCsvSet(process.env.SQL_MASKED_COLUMNS);
  const maxRows = parseInt(process.env.SQL_MAX_ROWS ?? "5000");

  const blockedTables: Set<string> = blockedTablesRaw ?? new Set();

  // maskedColumns: each entry is "schema.table.column" → value "[MASKED]"
  const maskedColumns = new Map<string, string>();
  if (maskedColumnsRaw) {
    for (const key of maskedColumnsRaw) {
      maskedColumns.set(key, "[MASKED]");
    }
  }

  return {
    allowedSchemas,
    blockedTables,
    maskedColumns,
    maxRows: isNaN(maxRows) || maxRows <= 0 ? 5000 : maxRows,
  };
}

export function getPolicy(): Policy {
  if (!_policy) {
    _policy = loadPolicy();
  }
  return _policy;
}

// Exposed for testing / hot-reload scenarios
export function resetPolicy(): void {
  _policy = null;
}

export function checkArgPolicy(
  schema?: string,
  table?: string
): { allowed: boolean; reason: string } {
  const policy = getPolicy();

  if (schema && policy.allowedSchemas && !policy.allowedSchemas.has(schema.toLowerCase())) {
    return {
      allowed: false,
      reason: `Schema '${schema}' is not in the allowed schemas list.`,
    };
  }

  if (schema && table) {
    const key = `${schema.toLowerCase()}.${table.toLowerCase()}`;
    if (policy.blockedTables.has(key)) {
      return { allowed: false, reason: `Access to '${schema}.${table}' is blocked by policy.` };
    }
  }

  return { allowed: true, reason: "" };
}

/**
 * Checks whether a raw query string references any blocked tables.
 * Uses word-boundary regex against each blocked "schema.table" pair.
 * Only active when SQL_BLOCKED_TABLES is set.
 */
export function checkQueryPolicy(query: string): { allowed: boolean; reason: string } {
  const policy = getPolicy();
  if (policy.blockedTables.size === 0) return { allowed: true, reason: "" };

  for (const blockedKey of policy.blockedTables) {
    // blockedKey is "schema.table" — escape dots for regex
    const escaped = blockedKey.replace(/\./g, "\\s*\\.\\s*");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(query)) {
      return {
        allowed: false,
        reason: `Query references blocked table '${blockedKey}'.`,
      };
    }
  }

  return { allowed: true, reason: "" };
}

/**
 * Masks column values in result rows for a given schema.table.
 * Returns the modified rows and a list of column names that were masked.
 */
export function maskRows(
  rows: Record<string, unknown>[],
  schemaName?: string,
  tableName?: string
): { rows: Record<string, unknown>[]; maskedColumns: string[] } {
  const policy = getPolicy();
  if (policy.maskedColumns.size === 0 || !schemaName || !tableName) {
    return { rows, maskedColumns: [] };
  }

  const prefix = `${schemaName.toLowerCase()}.${tableName.toLowerCase()}.`;
  const columnsToMask = new Set<string>();

  for (const [key] of policy.maskedColumns) {
    if (key.startsWith(prefix)) {
      const colName = key.slice(prefix.length);
      columnsToMask.add(colName);
    }
  }

  if (columnsToMask.size === 0) {
    return { rows, maskedColumns: [] };
  }

  const maskedColumnNames: string[] = [];
  const maskedRows = rows.map((row) => {
    const newRow = { ...row };
    for (const col of columnsToMask) {
      // Case-insensitive column match
      const matchedKey = Object.keys(newRow).find(
        (k) => k.toLowerCase() === col.toLowerCase()
      );
      if (matchedKey !== undefined && newRow[matchedKey] !== null && newRow[matchedKey] !== undefined) {
        newRow[matchedKey] = "[MASKED]";
        if (!maskedColumnNames.includes(matchedKey)) {
          maskedColumnNames.push(matchedKey);
        }
      }
    }
    return newRow;
  });

  return { rows: maskedRows, maskedColumns: maskedColumnNames };
}

/** Tools whose rows may contain schema+table references that should be filtered */
const LISTING_TOOL_SCHEMA_TABLE_KEYS: Record<string, { schema: string; table: string }> = {
  list_tables: { schema: "table_schema", table: "table_name" },
  list_views: { schema: "table_schema", table: "view_name" },
  list_temporal_tables: { schema: "table_schema", table: "table_name" },
};

/**
 * For listing tools (list_tables, list_views, etc.) filters out rows
 * whose schema.table matches a blocked table.
 */
export function filterListingRows(
  rows: Record<string, unknown>[],
  toolName: string
): Record<string, unknown>[] {
  const policy = getPolicy();
  if (policy.blockedTables.size === 0) return rows;

  const keys = LISTING_TOOL_SCHEMA_TABLE_KEYS[toolName];
  if (!keys) return rows;

  return rows.filter((row) => {
    const schema = String(row[keys.schema] ?? "").toLowerCase();
    const table = String(row[keys.table] ?? "").toLowerCase();
    return !policy.blockedTables.has(`${schema}.${table}`);
  });
}
