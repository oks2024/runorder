/**
 * Canonical spec model — the single source of truth.
 *
 * Everything else (the prompt emitter, the future script emitter, the deferred graph view,
 * and the Zustand store) is a projection/serializer over this model. The Zod schema *is*
 * the model: TS types are derived via `z.infer`, and parsing is the load-from-disk boundary.
 *
 * Graph-level rules (no dangling `AgentRef`) are NOT expressible in Zod — they live in a
 * separate pass in `validate.ts`. Cycle detection is a no-op in V1 (a sequence/fanout tree
 * has no back-edges); it becomes real only when A+ `Grant` delegation lands.
 *
 * Shape mirrors `Architecture.md` "Draft spec schema". The full recursive `PatternNode`
 * union (incl. deferred patterns) is encoded here even though the V1 editor exposes only
 * `sequence` + `fanout` — deferred patterns are a model capability the editor catches up to.
 */
import { z } from 'zod'

/** Workflow run caps (intended bounds, not runtime-guaranteed). */
export const capsSchema = z.object({
  concurrency: z.number().int().min(1).max(16),
  total: z.number().int().min(1).max(1000),
})
export type Caps = z.infer<typeof capsSchema>

/**
 * `model` accepts `inherit` or any non-empty string: the raw-id escape is *valid* (just
 * unverified). Family classification lives in `lib/models.ts`, not in the schema.
 */
export const agentSchema = z.object({
  /** Stable opaque id (generated); never shown; `AgentRef`s point here. */
  id: z.string().min(1),
  /** Editable display label / role; the emitter serializes by name. */
  name: z.string().min(1),
  /** Enforced; alias resolved to canonical id on emit. */
  model: z.string().min(1),
  prompt: z.string(),
})
export type Agent = z.infer<typeof agentSchema>

/** A reference to an `Agent.id`. Dangling-ref check = id exists in `agents[]` (see validate.ts). */
export const agentRefSchema = z.string().min(1)
export type AgentRef = z.infer<typeof agentRefSchema>

/** Capped delegation grant (A+; deferred — reintroduces cycle risk). */
export interface Grant {
  agent: AgentRef
  cap: number
}

/**
 * Composition tree. Self-referential (`sequence.steps`, `iterateUntil.body`), so the TS
 * type is declared explicitly and the schema is annotated `z.ZodType<PatternNode>` via
 * `z.lazy`. V1 editor exposes only `sequence` + `fanout`; the rest are model-only for now.
 */
export type PatternNode =
  | { type: 'sequence'; steps: PatternNode[] } // implicit forward-passing of results
  | { type: 'fanout'; agent: AgentRef; cap: number } // maps over prior output, dynamic N, ≤ cap
  // --- deferred patterns (model supports them; V1 editor does not expose) ---
  | { type: 'mapReduce'; map: { agent: AgentRef; cap: number }; reduce: AgentRef }
  | { type: 'adversarial'; producer: AgentRef; critic: AgentRef }
  | { type: 'multiAngle'; agent: AgentRef; angles: number; vote: AgentRef }
  | { type: 'iterateUntil'; body: PatternNode; maxIter: number }
  | { type: 'agent'; agent: AgentRef; grants?: Grant[] } // A+ leaf (a single-agent step)

const grantSchema: z.ZodType<Grant> = z.object({
  agent: agentRefSchema,
  cap: z.number().int().min(1).max(16),
})

export const patternNodeSchema: z.ZodType<PatternNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('sequence'),
      steps: z.array(patternNodeSchema),
    }),
    z.object({
      type: z.literal('fanout'),
      agent: agentRefSchema,
      cap: z.number().int().min(1).max(16),
    }),
    z.object({
      type: z.literal('mapReduce'),
      map: z.object({ agent: agentRefSchema, cap: z.number().int().min(1).max(16) }),
      reduce: agentRefSchema,
    }),
    z.object({
      type: z.literal('adversarial'),
      producer: agentRefSchema,
      critic: agentRefSchema,
    }),
    z.object({
      type: z.literal('multiAngle'),
      agent: agentRefSchema,
      angles: z.number().int().min(1),
      vote: agentRefSchema,
    }),
    z.object({
      type: z.literal('iterateUntil'),
      body: patternNodeSchema,
      maxIter: z.number().int().min(1),
    }),
    z.object({
      type: z.literal('agent'),
      agent: agentRefSchema,
      grants: z.array(grantSchema).optional(),
    }),
  ]),
)

/** The whole workflow. `root` is a `sequence` in V1. */
export const workflowSpecSchema = z.object({
  name: z.string().min(1),
  caps: capsSchema,
  agents: z.array(agentSchema),
  root: patternNodeSchema,
})
export type WorkflowSpec = z.infer<typeof workflowSpecSchema>
