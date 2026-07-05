/**
 * `GET /api/health` — a deliberately tiny liveness probe whose real job is a *build* proof.
 *
 * The point of this endpoint is not the JSON it returns; it is that it imports a real module
 * from `src/` via a relative path (`../../src/spec/schema`). Pages Functions are bundled by
 * esbuild independently of Vite and of the app's `@/*` path alias, so this import is the
 * canary that the Functions bundler can reach into and compile shared `src/` code. If the
 * bundling seam ever breaks, this route stops responding — a cheap, honest smoke test.
 *
 * It also actually exercises the schema (a real `safeParse` of a minimal valid spec) so the
 * import can't be tree-shaken to nothing and the response reflects a live validation.
 */
import { workflowSpecSchema } from '../../src/spec/schema'

/** A minimal spec that is known-valid at the Zod (shape) level. */
const PROBE_SPEC = {
  name: 'health-probe',
  caps: { concurrency: 1, total: 1 },
  agents: [{ id: 'a', name: 'a', model: 'inherit', prompt: '' }],
  root: { type: 'sequence', steps: [{ type: 'agent', agent: 'a', id: 'n-1' }] },
}

export function onRequestGet(): Response {
  const specSchema = workflowSpecSchema.safeParse(PROBE_SPEC).success
    ? 'loaded'
    : 'broken'
  return new Response(JSON.stringify({ ok: true, specSchema }), {
    headers: {
      'content-type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
