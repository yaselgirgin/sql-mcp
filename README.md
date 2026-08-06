# sql-mcp

A read-only MCP (Model Context Protocol) server for relational databases. Gives Claude and other MCP clients the ability to explore and query databases — schemas, tables, views, stored procedures, indexes, foreign keys, and arbitrary SELECT queries.

**Supported databases:** SQL Server · PostgreSQL  
**Extensible:** the provider factory lets you add any database engine with a single `npm run scaffold` command.

---

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Connecting to Claude Code](#connecting-to-claude-code)
- [Running in HTTP mode (Docker)](#running-in-http-mode-docker)
- [Available tools — SQL Server](#available-tools--sql-server)
- [Available tools — PostgreSQL](#available-tools--postgresql)
- [Permissions](#permissions)
- [Read-only enforcement](#read-only-enforcement)
- [Policy / Data Privacy](#policy--data-privacy)
- [Audit Logging](#audit-logging)
- [Adding a new provider](#adding-a-new-provider)
- [Development](#development)

---

## Requirements

- Node.js 22+
- Access to a **SQL Server** instance (on-prem, Azure SQL, or SQL Server in Docker), **or** a **PostgreSQL** instance (v13+)
- A dedicated read-only database login (see [Read-only enforcement](#read-only-enforcement))

---

## Installation

```bash
git clone https://github.com/teghoz/sql-mcp.git
cd sql-mcp
npm install
npm run build
```

---

## Configuration

Copy `.env.example` to `.env` and fill in your connection details.

```bash
cp .env.example .env
```

### Provider selection

Set `DB_PROVIDER` to choose the database engine. Defaults to `mssql`.

```env
DB_PROVIDER=mssql      # SQL Server (default)
DB_PROVIDER=postgres   # PostgreSQL
```

---

### SQL Server configuration

#### Option A — Connection string

Provide a single ADO.NET connection string. When `SQL_CONNECTION_STRING` is set, all individual `SQL_*` parameters are ignored.

```env
SQL_CONNECTION_STRING=Server=myserver,1433;Database=mydb;User Id=myuser;Password=secret;Encrypt=true;TrustServerCertificate=false;
```

Common connection string keywords:

| Keyword | Example | Notes |
|---|---|---|
| `Server` | `myserver` or `myserver,1433` | Hostname; append port with a comma |
| `Database` | `mydb` | Default database |
| `User Id` | `myuser` | SQL Server login |
| `Password` | `secret` | |
| `Encrypt` | `true` / `false` | Use `true` for Azure SQL |
| `TrustServerCertificate` | `true` | Set `true` in dev with self-signed certs |
| `Connection Timeout` | `30` | Seconds |

##### .NET app-config style keys

Connection strings copied straight out of a .NET `app.config` / `web.config` also work —
the server normalises the following keys before handing them to the driver, so no editing
is needed:

| .NET key | Normalised to |
|---|---|
| `Data Source` | `Server` |
| `Initial Catalog` | `Database` |
| `User ID` | `User Id` |
| `Integrated Security` | `Trusted_Connection` |
| `Connect Timeout` | `Connection Timeout` |

These keys are recognised by .NET but not by the underlying `mssql` driver, and are
stripped rather than silently ignored: `Persist Security Info`,
`MultipleActiveResultSets`, `Application Name`.

#### Option B — Individual parameters

```env
SQL_SERVER=localhost
SQL_PORT=1433                       # default: 1433
SQL_DATABASE=master                 # default database for queries
SQL_USER=sa
SQL_PASSWORD=your_password

SQL_ENCRYPT=false                   # true for Azure SQL
SQL_TRUST_SERVER_CERTIFICATE=true   # true for self-signed certs in dev
SQL_REQUEST_TIMEOUT=30000           # query timeout in ms (default: 30000)
```

---

### PostgreSQL configuration

#### Option A — Connection string

```env
PG_CONNECTION_STRING=postgresql://myuser:secret@localhost:5432/mydb
```

#### Option B — Individual parameters

```env
PG_HOST=localhost
PG_PORT=5432                        # default: 5432
PG_DATABASE=postgres                # default database for queries
PG_USER=myuser
PG_PASSWORD=your_password

PG_SSL=false                        # true for SSL connections
PG_STATEMENT_TIMEOUT=30000          # query timeout in ms (default: 30000)
```

---

### HTTP mode (optional)

Set `PORT` to start the server in HTTP mode instead of stdio. Required for Docker deployments.

```env
PORT=3000
```

---

## Connecting to Claude Code

Add the server to your Claude Code MCP configuration. The location of the config file depends on your setup:

- **Project-level:** `.claude/settings.json` in your project root
- **Global:** `~/.claude/settings.json`

### stdio mode (recommended for local use)

```json
{
  "mcpServers": {
    "sql-mcp": {
      "command": "node",
      "args": ["C:/Projects/sql-mcp/dist/index.js"],
      "env": {
        "SQL_CONNECTION_STRING": "Server=myserver,1433;Database=mydb;User Id=myuser;Password=secret;Encrypt=false;TrustServerCertificate=true;"
      }
    }
  }
}
```

Or with individual parameters:

```json
{
  "mcpServers": {
    "sql-mcp": {
      "command": "node",
      "args": ["C:/Projects/sql-mcp/dist/index.js"],
      "env": {
        "SQL_SERVER": "myserver",
        "SQL_PORT": "1433",
        "SQL_DATABASE": "mydb",
        "SQL_USER": "myuser",
        "SQL_PASSWORD": "secret",
        "SQL_ENCRYPT": "false",
        "SQL_TRUST_SERVER_CERTIFICATE": "true"
      }
    }
  }
}
```

Alternatively, place connection details in a `.env` file at `C:/Projects/sql-mcp/.env` and omit the `env` block — the server loads `.env` automatically on startup.

### Using `claude mcp add` (Claude Code CLI)

The fastest way to register the server without editing JSON:

```powershell
claude mcp add sql-mcp --scope user -e DB_PROVIDER=mssql -e SQL_SERVER=myserver -e SQL_DATABASE=mydb -e SQL_USER=myuser -e SQL_PASSWORD=secret -e SQL_ENCRYPT=false -e SQL_TRUST_SERVER_CERTIFICATE=true -- node "C:/Projects/sql-mcp/dist/index.js"
```

Use `--scope user` to make it available across all projects, or `--scope project` to limit it to the current project.

### Connecting to multiple databases

**Same server, different databases** — no extra configuration needed. Every tool accepts an optional `database` parameter. A single sql-mcp instance maintains a separate connection pool per database:

> "Show me all tables in the `Reporting` database"  
> Claude calls `list_tables` with `database: "Reporting"` automatically.

**Different servers** — register the server twice under different names:

```powershell
claude mcp add sql-mcp-prod --scope user -e SQL_SERVER=prod-server -e SQL_USER=reader -e SQL_PASSWORD=secret -- node "C:/Projects/sql-mcp/dist/index.js"
```

```powershell
claude mcp add sql-mcp-dev --scope user -e SQL_SERVER=dev-server -e SQL_USER=reader -e SQL_PASSWORD=secret -- node "C:/Projects/sql-mcp/dist/index.js"
```

Each registration is an independent process. Claude sees them as distinct MCP servers and can query both in the same conversation.

### HTTP mode

If you are running the server in HTTP mode (e.g. via Docker), use the `url` transport:

```json
{
  "mcpServers": {
    "sql-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## Running in HTTP mode (Docker)

HTTP mode is useful when you want a shared server accessible from multiple clients or remote deployments.

### Docker Compose

Create a `.env` file with your connection details (see [Configuration](#configuration)), then:

```bash
docker compose up --build
```

The MCP endpoint will be available at `http://localhost:3000/mcp`.
A health check endpoint is available at `http://localhost:3000` and returns:

```json
{ "name": "sql-mcp", "version": "1.0.0", "tools": 38 }
```

### Docker only

```bash
docker build -t sql-mcp .
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e SQL_CONNECTION_STRING="Server=myserver,1433;Database=mydb;User Id=myuser;Password=secret;" \
  sql-mcp
```

---

## Available tools — SQL Server

All tools return JSON. Most accept an optional `database` parameter — when omitted, queries run against the database specified in your connection configuration.

### `list_databases`

Lists all online databases on the SQL Server instance.

| Parameter | Required | Description |
|---|---|---|
| — | | No parameters |

---

### `list_schemas`

Lists all schemas in a database with their owner.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |

---

### `list_tables`

Lists all base tables in a database.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `describe_table`

Returns column definitions for a table: name, data type, nullability, max length, precision, scale, and default value.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `table` | Yes | Table name |
| `database` | No | Database name (defaults to configured default) |

---

### `get_table_indexes`

Returns all indexes on a table, including type, uniqueness, primary key flag, and the list of key columns.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `table` | Yes | Table name |
| `database` | No | Database name (defaults to configured default) |

---

### `get_foreign_keys`

Returns all foreign key constraints for a table: parent and referenced columns, and the delete/update referential actions.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `table` | Yes | Table name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_views`

Lists all views in a database.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `describe_view`

Returns column definitions and the full SQL definition for a view.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `view` | Yes | View name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_stored_procedures`

Lists all stored procedures in a database with their created and last-altered timestamps.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `get_stored_procedure_definition`

Returns the full source definition of a stored procedure. Uses `sys.sql_modules` to avoid the 4000-character limit of `INFORMATION_SCHEMA`.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `name` | Yes | Stored procedure name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_synonyms`

Lists all synonyms in a database with the base object each one points to.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `get_synonym_definition`

Returns the base object a synonym resolves to, along with created and modified dates.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `name` | Yes | Synonym name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_functions`

Lists all user-defined functions (scalar, inline table-valued, multi-statement table-valued, CLR) in a database.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `get_function_definition`

Returns the full source definition of a user-defined function.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `name` | Yes | Function name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_triggers`

Lists all DML triggers in a database with their parent table, events (INSERT/UPDATE/DELETE), enabled state, and INSTEAD OF flag.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by parent table schema |
| `table` | No | Filter by parent table name |

---

### `get_trigger_definition`

Returns the full source definition of a DML trigger.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema of the parent table (e.g. `dbo`) |
| `name` | Yes | Trigger name |
| `database` | No | Database name (defaults to configured default) |

---

### `get_table_constraints`

Returns all constraints defined on a table: PRIMARY KEY, UNIQUE, CHECK, and DEFAULT.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `table` | Yes | Table name |
| `database` | No | Database name (defaults to configured default) |

---

### `get_extended_properties`

Returns all extended properties on a database object and its columns (commonly used to store `MS_Description` documentation).

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `name` | Yes | Object name (table, view, procedure, function, etc.) |
| `database` | No | Database name (defaults to configured default) |

Each row includes `property_name`, `property_value`, `scope` (`object` or `column`), and `column_name`.

---

### `list_sequences`

Lists all sequences in a database with data type, range, increment, cycling, and current value.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `get_table_stats`

Returns row count and disk space usage (total, used, unused in MB) for a table.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `table` | Yes | Table name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_database_users`

Lists all users in a database with their type, default schema, and mapped login.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |

---

### `list_database_roles`

Lists all database roles and their members. Includes fixed roles and roles with no members.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |

---

### `get_object_permissions`

Returns all explicit permissions granted on a database object (GRANT/DENY/REVOKE).

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `name` | Yes | Object name (table, view, procedure, etc.) |
| `database` | No | Database name (defaults to configured default) |

---

### `get_server_properties`

Returns SQL Server instance metadata: version, edition, collation, clustering, and HA state. No parameters required.

---

### `list_linked_servers`

Lists all linked servers configured on the instance. Requires `VIEW ANY DEFINITION` permission — see [Permissions](#permissions).

No parameters.

---

### `list_agent_jobs`

Lists all SQL Server Agent jobs with enabled state, category, owner, and last run outcome. Requires `SQLAgentUserRole` in `msdb` — see [Permissions](#permissions).

No parameters.

---

### `get_job_history`

Returns execution history for a SQL Server Agent job. Requires `SQLAgentUserRole` in `msdb` — see [Permissions](#permissions).

| Parameter | Required | Description |
|---|---|---|
| `job_name` | Yes | Exact job name |
| `top` | No | Number of most-recent entries to return (default: 50, max: 500) |

---

### `list_partition_functions`

Lists all partition functions in the database, including range type (LEFT/RIGHT), partition count, and boundary values.

No parameters.

---

### `list_partition_schemes`

Lists all partition schemes with the function they use and the filegroups mapped to each partition.

No parameters.

---

### `list_fulltext_catalogs`

Lists all full-text search catalogs in a database with item count, size in MB, and populate status.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |

---

### `list_fulltext_indexes`

Lists all full-text indexes with catalog name, indexed columns, and change-tracking state.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `list_service_queues`

Lists all Service Broker queues with enqueue/receive/activation state and activation procedure.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `list_broker_services`

Lists all Service Broker services and the queue each is bound to.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |

---

### `list_user_types`

Lists all user-defined scalar types and table types, including the underlying base type.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `get_table_type_columns`

Returns the column definitions for a user-defined table type.

| Parameter | Required | Description |
|---|---|---|
| `schema` | Yes | Schema name (e.g. `dbo`) |
| `name` | Yes | Table type name |
| `database` | No | Database name (defaults to configured default) |

---

### `list_temporal_tables`

Lists all system-versioned temporal tables in a database, showing the linked history table for each.

| Parameter | Required | Description |
|---|---|---|
| `database` | No | Database name (defaults to configured default) |
| `schema` | No | Filter by schema name (e.g. `dbo`) |

---

### `execute_query`

Executes a read-only SELECT query and returns the result set.

| Parameter | Required | Description |
|---|---|---|
| `query` | Yes | A `SELECT` or `WITH … SELECT` (CTE) statement |
| `database` | No | Database to run the query against |
| `max_rows` | No | Row cap (default: 1000, max: 5000) |

Returns:

```json
{
  "rows": [ { "col1": "value", "col2": 42 } ],
  "row_count": 1,
  "truncated": false
}
```

`truncated` is `true` when the result set exceeded `max_rows`. Use `TOP` or `FETCH NEXT` in your query for better performance on large tables.

---

## Available tools — PostgreSQL

Set `DB_PROVIDER=postgres` to use these tools. PostgreSQL-specific introspection uses `information_schema` and `pg_catalog`.

| Tool | Description |
|---|---|
| `list_databases` | All non-template databases with size and encoding |
| `list_schemas` | User-defined schemas (excludes system schemas) |
| `list_tables` | Base tables with optional schema filter and total size |
| `describe_table` | Column definitions — type, nullability, default, comments |
| `get_table_indexes` | Indexes including type, uniqueness, and definition SQL |
| `get_foreign_keys` | Foreign key constraints with update/delete rules |
| `list_views` | Views with updatability flags |
| `describe_view` | Column definitions + view definition SQL |
| `list_functions` | User-defined functions and procedures with signatures |
| `get_function_definition` | Full source definition via `pg_get_functiondef()` |
| `list_triggers` | Triggers with optional schema/table filter |
| `get_trigger_definition` | Trigger definition via `pg_get_triggerdef()` |
| `list_sequences` | Sequences with start, min, max, increment, and last value |
| `get_table_stats` | Row count, live/dead rows, table/index sizes, vacuum times |
| `get_server_properties` | Version, current user/database, memory config, total size |
| `execute_query` | Ad-hoc read-only SELECT query |

---

## Permissions

Most tools work with `db_datareader` on the target database plus `VIEW DEFINITION` for source definitions. A few tools require elevated permissions:

| Tool(s) | Required permission | Reason |
|---|---|---|
| `list_agent_jobs`, `get_job_history` | `SQLAgentUserRole` (or higher) in `msdb` | Agent job tables live in `msdb.dbo` |
| `list_linked_servers` | `VIEW ANY DEFINITION` server permission or `sysadmin` | `sys.servers` requires this for non-sysadmin logins |
| `get_function_definition`, `get_trigger_definition`, `get_stored_procedure_definition` | `VIEW DEFINITION` on the object or `VIEW ANY DEFINITION` | Required to read `sys.sql_modules.definition` |

To grant `SQLAgentUserRole` in msdb:

```sql
USE msdb;
CREATE USER sql_mcp_reader FOR LOGIN sql_mcp_reader;
ALTER ROLE SQLAgentUserRole ADD MEMBER sql_mcp_reader;
```

To grant `VIEW ANY DEFINITION` at the server level:

```sql
GRANT VIEW ANY DEFINITION TO sql_mcp_reader;
```

---

## Read-only enforcement

The server enforces read-only access at two layers:

1. **Application layer** — `execute_query` validates the query before it reaches SQL Server. It strips SQL comments, checks that the statement starts with `SELECT` or `WITH`, and blocks any query containing write keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `EXEC`, `EXECUTE`, `MERGE`, `GRANT`, `REVOKE`, `DENY`, `BULK`, `OPENROWSET`, `OPENDATASOURCE`). The schema exploration tools (`list_tables`, `describe_table`, etc.) use parameterised queries against read-only system views only.

2. **Database layer (recommended)** — Create a dedicated SQL Server login with only `db_datareader` membership (and `VIEW DEFINITION` if you need stored procedure source). This is the primary safeguard and ensures read-only access even if the application layer is bypassed.

```sql
-- Create a dedicated read-only login
CREATE LOGIN sql_mcp_reader WITH PASSWORD = 'strong_password_here';

-- In each database you want to expose:
USE [your_database];
CREATE USER sql_mcp_reader FOR LOGIN sql_mcp_reader;
ALTER ROLE db_datareader ADD MEMBER sql_mcp_reader;

-- Optional: allow reading stored procedure / view definitions
GRANT VIEW DEFINITION TO sql_mcp_reader;
```

> **Note:** Write access (`INSERT`, `UPDATE`, `DELETE`) is not supported in the current version. The `SQL_ACCESS_LEVEL` environment variable is reserved for a future release that will make the access level configurable.

---

## Policy / Data Privacy

Four environment variables let you restrict access and mask sensitive data without modifying SQL Server permissions.

| Variable | Description |
|---|---|
| `SQL_ALLOWED_SCHEMAS` | Comma-separated list of schemas the MCP may access. When unset, all schemas are accessible. |
| `SQL_BLOCKED_TABLES` | Comma-separated `schema.table` pairs that are hidden from listing tools and blocked when accessed directly. |
| `SQL_MASKED_COLUMNS` | Comma-separated `schema.table.column` values whose content is replaced with `[MASKED]` in every response. |
| `SQL_MAX_ROWS` | Hard cap on rows returned by any tool (default: `5000`). |

**Example:**

```env
SQL_ALLOWED_SCHEMAS=dbo,reporting
SQL_BLOCKED_TABLES=dbo.audit_log,hr.salaries
SQL_MASKED_COLUMNS=dbo.users.ssn,dbo.users.credit_card,dbo.employees.salary
SQL_MAX_ROWS=1000
```

**Behaviour:**
- **Schema allowlist** — any tool call that specifies a `schema` argument not in the allowlist is rejected before the query runs.
- **Table blocklist** — blocked tables are filtered from `list_tables`, `list_views`, and `list_temporal_tables` results, and direct access via `describe_table`, `get_table_indexes`, etc. is rejected. `execute_query` checks the raw SQL text for blocked table references.
- **Column masking** — matched column values are replaced with `[MASKED]` in the response. The original data is never sent to the client.
- **Row cap** — `execute_query` respects the lower of the caller's requested `max_rows` and `SQL_MAX_ROWS`.

> These controls operate at the MCP layer. For defence in depth, combine them with database-level permissions (see [Read-only enforcement](#read-only-enforcement)).

---

## Audit Logging

Every tool call is recorded — including blocked requests. Records are written to two sinks simultaneously:

### File sink

A daily-rotating JSON log file is written to `${AUDIT_LOG_PATH}/audit-YYYY-MM-DD.log` (UTC date). Each line is a JSON object:

```json
{
  "ts": "2026-04-13T14:23:01.456Z",
  "tool": "describe_table",
  "database_name": "MyApp",
  "schema_name": "dbo",
  "object_name": "users",
  "query_hash": "e3b0c44298fc1c149afb...",
  "row_count": 12,
  "masked_cols": "[\"ssn\",\"credit_card\"]",
  "blocked": false,
  "block_reason": null,
  "duration_ms": 42
}
```

Set `AUDIT_LOG_PATH` to change the directory (default: `logs/`). The directory is created automatically.

### SQL sink

Set `AUDIT_CONNECTION_STRING` (or `AUDIT_DATABASE` to reuse the main connection params with a different database) to also insert records into a SQL table.

Create the table before enabling the SQL sink:

```sql
CREATE SCHEMA audit;

CREATE TABLE audit.mcp_audit_log (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  logged_at     DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  tool          NVARCHAR(100) NOT NULL,
  database_name NVARCHAR(128) NULL,
  schema_name   NVARCHAR(128) NULL,
  object_name   NVARCHAR(128) NULL,
  query_hash    CHAR(64) NULL,
  row_count     INT NULL,
  masked_cols   NVARCHAR(MAX) NULL,
  blocked       BIT NOT NULL DEFAULT 0,
  block_reason  NVARCHAR(500) NULL,
  duration_ms   INT NULL
);
```

The audit login needs only `INSERT` permission on `audit.mcp_audit_log`:

```sql
GRANT INSERT ON audit.mcp_audit_log TO sql_mcp_audit_writer;
```

**Fault tolerance:** audit write failures (file permission errors, SQL connectivity issues) are logged to stderr and never propagate to the tool response. A failed audit write does not block the tool from returning its result.

---

## Adding a new provider

The provider factory makes it straightforward to add support for any database engine (MySQL, SQLite, Oracle, etc.).

### 1. Scaffold the skeleton

```bash
npm run scaffold -- mysql
```

This creates `src/providers/mysql/` with a working skeleton: `client.ts`, `index.ts`, and stub tool files for `databases`, `schemas`, `tables`, and `execute_query`.

### 2. Install your driver

```bash
npm install mysql2
npm install --save-dev @types/mysql2
```

### 3. Implement `sqlQuery()` in `client.ts`

Wire up your driver's connection pool and query execution. The function signature is already in place — replace the `throw new Error("Not implemented")` stub with your driver code.

### 4. Fill in the tool queries

Each stub tool file has a `/* TODO */` placeholder with example SQL for PostgreSQL and MySQL as reference. Replace them with queries for your engine's system catalog.

### 5. Register the provider in `src/index.ts`

```typescript
if (providerName === "mysql") {
  const m = await import("./providers/mysql/index.js");
  return { provider: m.mysqlProvider, checkEnv: m.checkEnv };
}
```

### 6. Build and test

```bash
npm run build
DB_PROVIDER=mysql node dist/index.js
```

---

## Development

```bash
# Run directly with tsx (no build step needed)
npm run dev

# Build TypeScript to dist/
npm run build

# Start the compiled server
npm start

# Open the MCP Inspector UI in a browser (useful for testing tools interactively)
npm run inspect
```

The server logs startup information and errors to **stderr**, keeping stdout clean for the MCP stdio transport.
