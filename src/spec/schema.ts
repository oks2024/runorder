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
 * Node identity + explicit context flow ("memories").
 *
 * Every root-sequence step's output becomes a named memory; a node's `reads` lists the
 * `id`s of the EARLIER root steps whose memories are spliced (labeled) into its prompts at
 * emit time. Data no longer flows implicitly — `reads` absent/empty means the agent gets
 * only its own prompt (plus the pattern's own piping: fan-out item, critic draft, …).
 *
 * `id` is optional in the schema (hand-written specs stay valid; such nodes just can't be
 * read from) but the store factories and the seed always provide one. Reads referencing a
 * missing/later/duplicate id are surfaced by `validate.ts`, never silently dropped.
 */
interface NodeBase {
  /** Stable opaque node id; `reads` entries point here. */
  id?: string
  /** Ids of earlier root steps whose memories this node's prompts receive. */
  reads?: string[]
}

/**
 * Composition tree. Self-referential (`sequence.steps`, `iterateUntil.body`), so the TS
 * type is declared explicitly and the schema is annotated `z.ZodType<PatternNode>` via
 * `z.lazy`. V1 editor exposes only `sequence` + `fanout`; the rest are model-only for now.
 */
export type PatternNode =
  | { type: 'sequence'; steps: PatternNode[] } // ordered phases; context flows via `reads`
  | (NodeBase & { type: 'fanout'; agent: AgentRef; cap: number }) // maps over prior items, dynamic N, ≤ cap
  // --- deferred patterns (model supports them; V1 editor does not expose) ---
  | (NodeBase & { type: 'mapReduce'; map: { agent: AgentRef; cap: number }; reduce: AgentRef })
  | (NodeBase & { type: 'adversarial'; producer: AgentRef; critic: AgentRef })
  | (NodeBase & { type: 'multiAngle'; agent: AgentRef; angles: number; vote: AgentRef })
  | (NodeBase & { type: 'iterateUntil'; body: PatternNode; maxIter: number })
  | (NodeBase & { type: 'refine'; producer: AgentRef; critic: AgentRef; maxIter: number }) // draft → judge → revise until approved
  | (NodeBase & { type: 'verify'; skeptic: AgentRef; votes: number; cap: number }) // per-item refuter panel; majority gate filters the items
  | (NodeBase & { type: 'branches'; branches: AgentRef[] }) // heterogeneous parallel: N distinct agents, each once, same reads
  | (NodeBase & { type: 'agent'; agent: AgentRef; grants?: Grant[] }) // A+ leaf (a single-agent step)

const grantSchema: z.ZodType<Grant> = z.object({
  agent: agentRefSchema,
  cap: z.number().int().min(1).max(16),
})

const nodeBaseShape = {
  id: z.string().min(1).optional(),
  reads: z.array(z.string().min(1)).optional(),
}

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
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('mapReduce'),
      map: z.object({ agent: agentRefSchema, cap: z.number().int().min(1).max(16) }),
      reduce: agentRefSchema,
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('adversarial'),
      producer: agentRefSchema,
      critic: agentRefSchema,
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('multiAngle'),
      agent: agentRefSchema,
      angles: z.number().int().min(1),
      vote: agentRefSchema,
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('iterateUntil'),
      body: patternNodeSchema,
      maxIter: z.number().int().min(1),
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('refine'),
      producer: agentRefSchema,
      critic: agentRefSchema,
      maxIter: z.number().int().min(1),
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('verify'),
      skeptic: agentRefSchema,
      votes: z.number().int().min(1),
      cap: z.number().int().min(1).max(16),
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('branches'),
      branches: z.array(agentRefSchema).min(1),
      ...nodeBaseShape,
    }),
    z.object({
      type: z.literal('agent'),
      agent: agentRefSchema,
      grants: z.array(grantSchema).optional(),
      ...nodeBaseShape,
    }),
  ]),
)

/**
 * An optional launch input: what the user passes as the runtime `args` global. When set,
 * it is spliced into the FIRST phase's prompt as a labeled `[label]` block (see the emitters).
 * `label` names the block; `description` is a human-facing hint for the approval screen.
 */
export const workflowInputSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
})
export type WorkflowInput = z.infer<typeof workflowInputSchema>

/** The whole workflow. `root` is a `sequence` in V1. */
export const workflowSpecSchema = z.object({
  name: z.string().min(1),
  input: workflowInputSchema.optional(),
  caps: capsSchema,
  agents: z.array(agentSchema),
  root: patternNodeSchema,
})
export type WorkflowSpec = z.infer<typeof workflowSpecSchema>
