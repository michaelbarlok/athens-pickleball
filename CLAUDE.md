# Project Notes for Claude

## Database migrations

Migrations live in `supabase/migrations/`.

**There is NO Supabase ↔ GitHub integration on this project.** Merging a
migration to `main` does not apply it to production. Claude must apply
every new migration by hand the same session it's authored, using the
Supabase Management SQL API. The credentials are in `.env.local`:

- `SUPABASE_PROJECT_REF` — the project ref
- `SUPABASE_ACCESS_TOKEN` — a personal access token with SQL scope

The application step is two SQL calls per migration:

1. Run the migration's SQL:
   ```bash
   curl -s -X POST \
     "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d "$(jq -nc --arg q "$(cat supabase/migrations/<file>.sql)" '{query: $q}')"
   ```

2. Record it in `supabase_migrations.schema_migrations` so it shows up in
   the dashboard's Migrations table and isn't re-applied later. Use today's
   date for the version (`YYYYMMDDHHMMSS`) and the file's slug
   (everything after `NNN_`) for the name:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('<YYYYMMDDHHMMSS>', '<slug>')
   ON CONFLICT (version) DO NOTHING;
   ```

After applying, sanity-check with a follow-up `SELECT` against `pg_policies`,
`information_schema.columns`, etc. — an empty `[]` response from the SQL API
means "no rows," which is the expected reply for DDL but also for a query
that found nothing.

**Rule: any migration that changes the shape of a table — `ADD COLUMN`,
`DROP COLUMN`, `ALTER COLUMN`, renames, new tables, new views, new RPC
functions — must end with:**

```sql
NOTIFY pgrst, 'reload schema';
```

PostgREST keeps an in-memory schema cache and serves the JS client (and
PostgREST REST API) from it. Without the explicit notify, the cache can
miss DDL changes and the next `.insert({...})` or `.update({...})`
referencing the new column fails with:

> Could not find the 'X' column of 'Y' in the schema cache

This bit us once on `tournaments.win_by_2` (migrations 093/094). Don't
let it bite again — make the NOTIFY part of the muscle memory.

If a migration has already shipped without the NOTIFY and you're seeing
the schema-cache error in production, the fix is a one-line follow-up
migration containing only `NOTIFY pgrst, 'reload schema';`.
