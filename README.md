# FishBall Server List V2

Production-oriented Minecraft community frontend prototype and additive Supabase
migrations for forums, feedback, and moderated server submissions.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The current frontend uses local demonstration data so it can be reviewed without
production credentials. The SQL migrations under `supabase/migrations` define the
backend contract and RLS policies for Supabase integration.

## Additive V2 routes

- `/forum`
- `/feedback`
- `/submit-server`

Copy `.env.example` to `.env.local` and provide the existing V1 Supabase project URL
and anonymous key to enable persistence. See `docs/V1_SAFE_MERGE.md` before merging
these modules into the real production V1 repository.
