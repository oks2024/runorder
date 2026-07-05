/**
 * The typed environment bindings every Pages Function receives.
 *
 * `DB` is the D1 binding declared in `wrangler.toml`; the rest are secrets injected from
 * `.dev.vars` locally (see `.dev.vars.example`) and from the Pages project settings in
 * production. `D1Database` is a global from `@cloudflare/workers-types` — no import needed.
 */
export interface Env {
  DB: D1Database
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  SESSION_SECRET: string
  TURNSTILE_SECRET_KEY: string
}
