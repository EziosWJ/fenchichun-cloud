# Database migrations

PostgreSQL migrations are split by responsibility:

- `schema/` is the PostgreSQL stream retained at its historical path; it
  contains tables, indexes, constraints, and other schema changes.
- `seed/` is the PostgreSQL built-in-data stream retained at its historical
  path.


Run schema migrations before seed migrations. Each directory must use its own
Goose version table (`goose_schema_db_version` and
`goose_seed_db_version`), so the same migration number in one stream cannot
mark a migration in the other stream as applied. PostgreSQL uses the existing paths and version tables.

The API process must not run either stream automatically. The explicit migrate
command and deployment workflow own migration execution.
