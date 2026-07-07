# Analytics guide

How Runorder measures usage, how to run it, and how to read the numbers.

## The two layers

| Layer | Answers | Where it lives | Free-plan cost |
|---|---|---|---|
| **Cloudflare Web Analytics** | Traffic — pageviews, unique visitors, referrers, geography | Cloudflare dashboard (beacon → Cloudflare's endpoint) | **None** — never touches our Functions or D1 |
| **First-party events** | Product usage — which features get used, active visitors | Our D1 `events` table, via `POST /api/events` | 1 Pages Functions request + 1 D1 write **per event** |

**Design rule:** traffic is Web Analytics' job; the first-party pipeline records only deliberate
*product actions*. There is intentionally **no first-party `pageview` event** — logging every page
load would burn the free-plan Functions/D1 budget (shared with auth/save) on data Web Analytics
already gives us for free. Keep it that way.

## Setup checklist (production)

One-time, mostly in the Cloudflare dashboard — not code.

- [ ] **Apply the migration to the remote D1** (creates the `events` table):
  ```sh
  npm run db:migrate:prod
  ```
- [ ] **Set `ADMIN_LOGINS`** in the Pages project → Settings → Environment variables (Production).
  Comma-separated GitHub logins allowed to read `/api/stats`. Empty ⇒ nobody can read stats.
  ```
  ADMIN_LOGINS = your-github-login,teammate-login
  ```
- [ ] **Create a Cloudflare Web Analytics site** (dashboard → Analytics & Logs → Web Analytics →
  Add a site) and copy its **beacon token**.
- [ ] **Set `VITE_CF_BEACON_TOKEN`** as a **build-time** env var in the Pages build settings, then
  redeploy. This is a public token (baked into the bundle); when unset, the beacon simply isn't
  injected and only first-party events run.
- [ ] **Verify** after deploy: load the site (a hit should appear in Web Analytics within a minute),
  then do a product action (e.g. drag in a pattern) and confirm a row via `/api/stats` or a D1 query.

Local dev equivalents:

- [ ] `cp .dev.vars.example .dev.vars` and fill in secrets (incl. `ADMIN_LOGINS`). `.dev.vars` is gitignored.
- [ ] `npm run db:migrate` — apply migrations to the **local** D1.
- [ ] `npm run dev:api:dist` (or `dev:api`) — run the Functions locally on `:8788`.

## How to use it

### Recording a new product event

From anywhere in the client, call `track()` — fire-and-forget, never throws, honors Do-Not-Track:

```ts
import { track } from '@/api/analytics'

track('workflow_export')                       // bare event
track('pattern_insert', { kind: 'loop' })      // with small metadata
```

Rules the server enforces (`functions/api/_lib/analytics.ts`):

- **Name**: lowercase snake_case, 1–40 chars, starts with a letter (`/^[a-z][a-z0-9_]{0,39}$/`).
  Names are validated by *shape*, not an allowlist — no server change needed to add one.
- **Props**: small, non-PII metadata. Clamped to ≤12 keys; string values truncated to 200 chars;
  only string/number/boolean values kept (non-finite numbers dropped). Never put user content or
  identifiers in props.
- **Where to fire**: at the semantic seam for the action (a store action or the click handler),
  not in a render path — you want one event per real action, not per re-render.

### Events currently wired

| Event | Fires when | Props | Source |
|---|---|---|---|
| `pattern_insert` | A pattern is added to the rundown | `{ kind }` | `store/workflowStore.ts` (`insertPattern`) |
| `workflow_copy` | Emitted script/prompt is copied | `{ format }` (`script`\|`prompt`) | `components/studio/TopBar.tsx` |
| `workflow_export` | Spec is exported to a JSON file | — | `components/studio/LibraryMenu.tsx` |
| `cloud_save` | A workflow is saved to the cloud | — | `store/cloudStore.ts` (`saveToCloud`) |
| `workflow_publish` | A workflow is made public | — | `store/cloudStore.ts` (`setPublic`) |
| `signin_click` | User starts the GitHub sign-in | — | `store/authStore.ts` (`signIn`) |

## How to read the data

### Traffic

Cloudflare dashboard → **Web Analytics** → your site. Pageviews, visitors, top pages, referrers,
countries. Nothing to query.

### Product usage — `GET /api/stats` (admin only)

Requires a signed-in session whose GitHub login is in `ADMIN_LOGINS` (else 401/403). Returns
aggregates only — never raw rows:

```sh
# In a browser you're signed into as an admin, just visit /api/stats.
# From the CLI you need your session cookie:
curl -s https://runorder.dev/api/stats -H 'Cookie: ro_session=<your-cookie>' | jq
```

Shape:

```jsonc
{
  "generatedAt": "2026-07-07T…",
  "accounts": {
    "users": 42,            // total registered users
    "usersNew7d": 5,        // signed up in the last 7 days
    "workflows": 130,       // total saved workflows
    "publicWorkflows": 12   // currently public
  },
  "usage": {
    "events30d": 900,                                  // product events, last 30 days
    "activeVisitors": { "day": 8, "week": 40, "month": 120 },  // distinct visitors who acted
    "eventsByName": [{ "name": "pattern_insert", "count": 410 }, …],  // last 30 days
    "eventsByDay":  [{ "day": "2026-07-01", "count": 33 }, …]         // last 14 days
  }
}
```

> `activeVisitors` = distinct people who took a *tracked product action* (a `visitor` hash), which
> is an engagement metric — **not** raw traffic. Raw unique visitors live in Web Analytics.

### Ad-hoc D1 queries

```sh
# Local
npx wrangler d1 execute runorder --local  --command "SELECT name, COUNT(*) FROM events GROUP BY name"
# Production (read-only queries are safe; be careful with writes)
npx wrangler d1 execute runorder --remote --command "SELECT COUNT(DISTINCT visitor) FROM events WHERE created_at >= date('now','-7 days')"
```

## Privacy model

- **No cookies, no durable per-person id.** The client sends no identifier. Uniqueness is a
  server-side **daily-rotating** hash: `SHA-256(ip | ua | day | SESSION_SECRET)` truncated to 16 hex.
  It resets every UTC day and can't be reversed to an IP or linked across days.
- **Do-Not-Track / Global Privacy Control** suppress all first-party events.
- **`/api/events` is unauthenticated** (anonymous editor visitors are exactly who we count); a
  signed-in session is attributed via a nullable `user_id`.
- Because there are no cookies and no cross-site tracking, no consent banner is required.

## Free-plan limits to respect

| Limit (Workers/Pages Free) | Value | Notes |
|---|---|---|
| Pages Functions requests | 100,000 / day | Shared across **all** `/api/*` (auth, save, publish, events) |
| D1 rows written | 100,000 / day | 1 per event; shared with workflow saves |
| D1 rows read | 5,000,000 / day | `/api/stats` COUNTs read rows; admin-only ⇒ trivial |
| D1 storage | 500 MB/db, 5 GB/account | Event rows ~150 bytes ⇒ millions before it matters |

Exceeding a daily cap makes Cloudflare return **errors until midnight UTC** — which would break the
core app, not just analytics. Because we don't log pageviews first-party, event volume tracks real
actions and stays far below these caps for an early-stage app.

**Guardrails to keep it that way:**

- Never add a first-party `pageview` (or any per-render / per-navigation) event — use Web Analytics.
- Keep events tied to deliberate user actions; don't fire in loops, effects, or polling.
- If storage ever grows, prune old rows, e.g.
  `DELETE FROM events WHERE created_at < date('now','-90 days')` (run manually or via a scheduled job).

## Files

| File | Role |
|---|---|
| `migrations/0002_events.sql` | The `events` table + indexes |
| `functions/api/events.ts` | `POST /api/events` ingest (public, 204) |
| `functions/api/stats.ts` | `GET /api/stats` aggregates (admin-gated) |
| `functions/api/_lib/analytics.ts` | Pure helpers: name/props validation, daily visitor hash |
| `functions/api/_lib/guard.ts` | `requireAdmin` / `adminLogins` (the stats gate) |
| `src/api/analytics.ts` | Client `track()` + `initWebAnalytics()` |
