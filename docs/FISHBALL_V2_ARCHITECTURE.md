# FishBall Server List V2 architecture

This design is additive. It does not alter the existing `servers`, favorites, nickname,
profile, level, or VIP tables.

## API routes

The routes below are server-side endpoints. Every mutating route must derive the user
from the Supabase session; it must never accept `user_id`, `priority`, moderation
status, or role from request JSON.

| Method | Route | Purpose | Authorization |
|---|---|---|---|
| GET | `/api/forum/posts` | Cursor-paginated feed; filters: category, query, sort | Public |
| POST | `/api/forum/posts` | Create a post | Authenticated |
| GET | `/api/forum/posts/:id` | Post, author projection, like count, comments | Public |
| PATCH | `/api/forum/posts/:id` | Edit title/content/category | Owner or admin |
| DELETE | `/api/forum/posts/:id` | Delete post | Owner or admin |
| POST | `/api/forum/posts/:id/promotion` | Set `pinned`/`highlighted` through `set_post_promotion` RPC | VIP or admin |
| GET | `/api/forum/posts/:id/comments` | Cursor-paginated comments | Public |
| POST | `/api/forum/posts/:id/comments` | Add comment | Authenticated |
| PATCH | `/api/forum/comments/:id` | Edit comment | Owner or admin |
| DELETE | `/api/forum/comments/:id` | Delete comment | Owner or admin |
| PUT | `/api/forum/posts/:id/like` | Idempotently like (`upsert`, ignore duplicate) | Authenticated |
| DELETE | `/api/forum/posts/:id/like` | Remove own like | Authenticated |
| POST | `/api/feedback` | Submit feedback; DB derives VIP priority | Authenticated |
| GET | `/api/feedback/me` | Current user's feedback history | Authenticated |
| GET | `/api/admin/feedback` | Priority-ordered pending queue | Admin |
| POST | `/api/admin/feedback/:id/resolve` | Call `resolve_feedback` RPC | Admin |
| POST | `/api/server-submissions` | Submit a server for review | Authenticated |
| GET | `/api/server-submissions/me` | Current user's submissions | Authenticated |
| GET | `/api/admin/server-submissions` | Pending moderation queue | Admin |
| POST | `/api/admin/server-submissions/:id/review` | Call `review_server_submission` RPC | Admin |

Recommended feed ordering:

```sql
order by is_pinned desc, is_highlighted desc, created_at desc, id desc
```

Use keyset/cursor pagination rather than unbounded or high-offset queries. Escape `%`,
`_`, and backslashes before using user text in `ilike`, or use a dedicated full-text
search migration later.

## Frontend pages

| Page | Responsibilities |
|---|---|
| `/forum` | Category tabs, search, pinned/highlighted styling, pagination |
| `/forum/new` | Authenticated post composer with server-side validation errors |
| `/forum/[id]` | Post, comments, like control, owner actions, VIP promotion controls |
| `/forum/[id]/edit` | Owner/admin edit form |
| `/feedback` | Feedback form and the user's submission status/history |
| `/submit-server` | Server submission form and anti-spam/rate-limit feedback |
| `/dashboard/admin/feedback` | Admin priority queue and resolve action |
| `/dashboard/admin/server-submissions` | Approve/reject queue with rejection reason |

Enhance the existing profile/header components to display the VIP badge. Do not create
a second VIP state in the browser; read it from the authenticated server session.

## Shared frontend/database contract

Generate Supabase TypeScript types after applying migrations and import those generated
types in API handlers and UI data loaders. Canonical enum-like string values are:

- Post category: `servers_discussion`, `help`, `general_chat`
- Feedback status: `pending`, `resolved`
- Feedback priority: `normal`, `vip_high`
- Submission status: `pending`, `approved`, `rejected`

The UI may render localized labels, but it must send these canonical values.

## Backward compatibility

- New user foreign keys reference `auth.users(id)`, avoiding assumptions about the
  existing profile table name or primary key.
- No existing table, column, function, trigger, policy, or route is renamed or dropped.
- Forum likes use `(post_id, user_id)` as the primary key, matching the stable
  uniqueness behavior expected from favorites.
- Server approval does not automatically insert into the existing `servers` table.
  Approval and publication are separate until the current server schema is known.
- VIP/admin checks use signed `app_metadata`, not editable `user_metadata`. The existing
  VIP system must synchronize these claims and refresh affected users' sessions.

## Risks and conflicts

1. **Existing VIP/admin representation is unknown.** The migration expects signed JWT
   claims in `app_metadata`. If the current system stores VIP state only in a table,
   add a claim synchronization hook or adapt `is_vip()` to that table after confirming
   its exact schema.
2. **No existing repository/schema was available.** Naming collisions cannot be fully
   excluded. Run these migrations against a staging database and compare generated
   types before production.
3. **Approved server publication is intentionally not automatic.** A later adapter must
   map approved submissions into the existing server columns and ranking workflow.
4. **Hard deletes cascade.** If audit retention is required, add an audit/event table or
   soft-delete migration before launch.
5. **JWT claims are cached until token refresh.** VIP purchase/cancellation and admin
   changes should force a session refresh before new privileges are visible.
6. **Rate limiting is database-backed but account-scoped.** Add edge/API IP throttling
   and CAPTCHA for stronger abuse protection.
7. **Public forum content needs moderation controls.** Reporting, content filtering,
   admin audit logs, and moderation history are operational launch requirements even
   though they were outside the requested tables.
8. **Post counts are computed data.** Do not add mutable `like_count` or `comment_count`
   columns until query volume justifies maintained counters or a materialized view.

## Deployment checks

1. Back up production and apply migrations to staging in filename order.
2. Generate fresh Supabase types and compile all API/UI code against them.
3. Test RLS as anonymous, normal user, post owner, VIP, and admin.
4. Verify a normal user cannot set feedback priority, submission status, pin, or
   highlight through direct Supabase requests.
5. Test duplicate likes, duplicate active server IPs, and the 24-hour submission limit.
6. Confirm existing favorites, servers, nickname, profile, and VIP regression suites.

