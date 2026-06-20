/**
 * Bundled static model config.
 *
 * The agent `model` field is the headline, runtime-*enforced* attribute (Claude Code
 * pins the model per stage). This file is the source for the model picker: the Claude
 * family with short aliases, plus the `inherit` sentinel. Anything off this list is a
 * valid *raw-id escape* (accepted but unverified) — see `modelFamily`.
 *
 * Swappable to a runtime fetch later; for V1 it is a hand-maintained constant.
 */

export type ModelFamily = 'opus' | 'sonnet' | 'haiku'

/** Classification of a `model` value for UI coloring / honesty cues. */
export type ModelKind = 'inherit' | ModelFamily | 'rawid'

export interface ModelOption {
  /** Canonical full id — what the emitter writes. */
  id: string
  /** Short alias — a UI convenience; resolved to `id` on emit. */
  alias: string
  family: ModelFamily
}

/** Sentinel: use the session's model (no per-stage pin). Default for a new agent. */
export const INHERIT = 'inherit' as const

/** Current Claude family, most-capable first. */
export const MODELS: readonly ModelOption[] = [
  { id: 'claude-opus-4-8', alias: 'opus', family: 'opus' },
  { id: 'claude-sonnet-4-6', alias: 'sonnet', family: 'sonnet' },
  { id: 'claude-haiku-4-5', alias: 'haiku', family: 'haiku' },
] as const

/**
 * Resolve a `model` input to the value the artifact should carry.
 * Aliases (`opus`) become canonical ids (`claude-opus-4-8`); `inherit`, canonical ids,
 * and unknown raw ids pass through unchanged.
 */
export function resolveAlias(input: string): string {
  const match = MODELS.find((m) => m.alias === input)
  return match ? match.id : input
}

/** Classify a `model` value: inherit, a known family, or an unverified raw id. */
export function modelFamily(model: string): ModelKind {
  if (model === INHERIT) return 'inherit'
  const match = MODELS.find((m) => m.id === model || m.alias === model)
  return match ? match.family : 'rawid'
}
