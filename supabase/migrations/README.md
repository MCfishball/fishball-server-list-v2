# Migration order

Apply the additive V2 migrations in lexical order:

1. `202606190001_v2_security_helpers.sql`
2. `202606190002_v2_forum.sql`
3. `202606190003_v2_feedback.sql`
4. `202606190004_v2_server_submissions.sql`

Rollback should be delivered as a separately reviewed, forward migration. Do not edit
an already-applied production migration.

After applying:

```sh
supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > src/types/database.ts
```

Commit the generated types with the frontend implementation so schema mismatches fail
at build time.
