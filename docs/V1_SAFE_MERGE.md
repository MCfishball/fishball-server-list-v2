# V1 safe-merge notes

## Repository limitation

This repository contains the standalone V2 prototype created on June 19, 2026. It
does not contain the production V1 implementation for servers, favorites, VIP, or
nicknames. The integration therefore keeps the existing root route untouched and
isolates all new code behind new routes and new database objects.

Before merging into the real V1 repository, compare its route tree, authentication
provider, profile schema, and generated Supabase types.

## New routes

- `/forum`
- `/feedback`
- `/submit-server`

`/` remains the existing application fallback. In the real V1 router, import the
three page components without replacing the current V1 route definitions.

## Isolation guarantees

- No migration alters or drops `servers`, favorites, VIP, nickname, or profile tables.
- Server submissions enter `server_submissions`; approval does not insert into
  `servers`.
- V2 authorization helpers use the `fishball_v2_*` prefix to avoid replacing existing
  V1 database functions.
- Frontend database access is isolated under `src/lib`.
- Missing Supabase environment variables leave the existing app usable in demo mode.

## Required production wiring

Set:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The existing authentication session must be available to the Supabase client.
VIP/admin state must be synchronized into signed `app_metadata` before applying the
VIP pin/highlight and admin-review policies.

