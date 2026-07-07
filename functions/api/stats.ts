/**
 * `GET /api/stats` — the admin dashboard's data source (aggregates only, never raw rows).
 *
 * Admin-gated (`requireAdmin`): it reports across *all* users, so no ordinary signed-in user
 * may read it. Everything returned is a count or a small time series — there is no per-person
 * data here, matching the privacy posture of the events table it reads from.
 *
 * Scope: this endpoint covers *product usage* — account totals (from `users`/`workflows`) and
 * behavioural totals (from `events`): a per-name breakdown and *active*-visitor counts (distinct
 * `visitor`s who took a tracked action) over a few windows. Raw traffic (pageviews / total
 * unique visitors) lives in Cloudflare Web Analytics, not here — there is no first-party
 * pageview event, so this table only ever holds deliberate product actions.
 */
import type { Env } from './_lib/env'
import { json } from './_lib/http'
import { requireAdmin } from './_lib/guard'

/** ISO timestamp `daysAgo` days before `nowMs`, matching the `created_at` string format. */
function since(nowMs: number, daysAgo: number): string {
  return new Date(nowMs - daysAgo * 86_400_000).toISOString()
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const gate = await requireAdmin(context)
  if (gate instanceof Response) return gate
  const db = context.env.DB
  const now = Date.now()

  const scalar = async (sql: string, ...binds: unknown[]): Promise<number> => {
    const row = await db
      .prepare(sql)
      .bind(...binds)
      .first<{ n: number }>()
    return row?.n ?? 0
  }

  const [
    users,
    usersNew7d,
    workflows,
    publicWorkflows,
    events30d,
    visitors1d,
    visitors7d,
    visitors30d,
  ] = await Promise.all([
    scalar('SELECT COUNT(*) AS n FROM users'),
    scalar('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?1', since(now, 7)),
    scalar('SELECT COUNT(*) AS n FROM workflows'),
    scalar('SELECT COUNT(*) AS n FROM workflows WHERE is_public = 1'),
    scalar('SELECT COUNT(*) AS n FROM events WHERE created_at >= ?1', since(now, 30)),
    scalar('SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE created_at >= ?1', since(now, 1)),
    scalar('SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE created_at >= ?1', since(now, 7)),
    scalar('SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE created_at >= ?1', since(now, 30)),
  ])

  // Event breakdown by name (last 30 days), most frequent first.
  const byName = await db
    .prepare(
      `SELECT name, COUNT(*) AS count
       FROM events WHERE created_at >= ?1
       GROUP BY name ORDER BY count DESC`,
    )
    .bind(since(now, 30))
    .all<{ name: string; count: number }>()

  // Daily product-action volume for the last 14 days (sparse — quiet days are simply absent).
  const eventsByDay = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM events WHERE created_at >= ?1
       GROUP BY day ORDER BY day ASC`,
    )
    .bind(since(now, 14))
    .all<{ day: string; count: number }>()

  return json({
    generatedAt: new Date(now).toISOString(),
    accounts: {
      users,
      usersNew7d,
      workflows,
      publicWorkflows,
    },
    usage: {
      events30d,
      // Distinct visitors who took a tracked *product action* (not raw traffic — see header).
      activeVisitors: { day: visitors1d, week: visitors7d, month: visitors30d },
      eventsByName: byName.results,
      eventsByDay: eventsByDay.results,
    },
  })
}
