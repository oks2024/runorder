/**
 * The server-side seam onto the *same* spec validation the app uses on import.
 *
 * Guardrail #1: the spec model is the single source of truth, and there is exactly one
 * validation pipeline (`validateSpecValue` — unwrap → Zod safeParse → graph rules). The
 * backend reuses it verbatim rather than growing a second, drifting validator. This module
 * is a thin re-export plus the shared size cap so handlers all agree on the same numbers.
 *
 * The raw-body length check (against `MAX_SPEC_BYTES`) belongs in the handler, *before*
 * `JSON.parse`, so an oversized payload is rejected without ever being parsed; this module
 * only owns the constant and the post-parse validation call.
 */
import { validateSpecValue } from '../../../src/io/persist'

/** Hard ceiling on an incoming spec's raw JSON body, in bytes. */
export const MAX_SPEC_BYTES = 100 * 1024

/** Validate an already-parsed request value into a loadable spec, or a readable error. */
export function checkIncomingSpec(value: unknown) {
  return validateSpecValue(value)
}
