// One routing decision end to end: build the state, ask the router, apply the policy, produce the log record.
// The OpenCode plugin, route-once and the evaluation all go through here, so measured behaviour is live behaviour.
import { tierById, type Config, type RouterName } from "./config.ts"
import type { DecisionRecord } from "./log.ts"
import { applyPolicy } from "./policy.ts"
import type { Router, RouterResult } from "./router.ts"
import { buildState, type RoutingState, type StateInput } from "./state.ts"
import { systemOneRouter } from "./systemone.ts"

export interface RouteTurnInput {
  config: Config
  router: Router
  state: StateInput
  sessionID: string
  parentSessionID?: string
  /** Overrides the configured state budget (used by the evaluation's state-size sweep). */
  budgetTokens?: number
  meta?: Record<string, unknown>
}

export interface RouteTurnOutput {
  appliedTier: string
  /** "providerID/modelID#variant" for the applied tier. */
  targetModel: string
  record: DecisionRecord
  state: RoutingState
  result?: RouterResult
}

export const modelRef = (tier: { model: string; variant?: string }) =>
  tier.variant ? `${tier.model}#${tier.variant}` : tier.model

export async function routeTurn(input: RouteTurnInput): Promise<RouteTurnOutput> {
  const { config, router } = input
  const state = buildState(input.state, { budgetTokens: input.budgetTokens ?? config.state.budgetTokens })
  const currentTier = input.state.currentTier

  const started = performance.now()
  let result: RouterResult | undefined
  let error: unknown
  try {
    result = await router.route(config.tiers, state)
  } catch (e) {
    error = e
  }
  const latencyMs = result?.latencyMs ?? Math.round(performance.now() - started)

  const outcome = applyPolicy({
    result,
    error,
    currentTier,
    tiers: config.tiers.map((t) => t.id),
    defaultTier: config.defaultTier,
    threshold: config.policy.threshold,
    margin: config.policy.margin,
  })
  const targetModel = modelRef(tierById(config, outcome.appliedTier))
  const inputTokens = result?.usage.inputTokens ?? 0
  const price =
    router.name === "systemone" ? config.systemOne.pricePerMTok : router.name === "jev" ? config.jev.pricePerMTok : 0

  const record: DecisionRecord = {
    ts: new Date().toISOString(),
    sessionID: input.sessionID,
    ...(input.parentSessionID ? { parentSessionID: input.parentSessionID } : {}),
    router: router.name,
    decisionModel: router.model,
    ...(result?.modelVersion ? { decisionModelVersion: result.modelVersion } : {}),
    ...(outcome.proposedTier ? { proposedTier: outcome.proposedTier } : {}),
    appliedTier: outcome.appliedTier,
    targetModel,
    ...(currentTier ? { previousTier: currentTier } : {}),
    ...(result ? { confidence: result.confidence } : {}),
    ...(result?.scores ? { probabilities: result.scores } : {}),
    reason: outcome.reason,
    switched: currentTier !== undefined && currentTier !== outcome.appliedTier,
    latencyMs,
    state: {
      estimatedTokens: state.estimatedTokens,
      chars: state.text.length,
      truncated: state.truncated,
      droppedMessages: state.droppedMessages,
    },
    ...(result?.inputTruncated ? { routerInputTruncated: true } : {}),
    usage: result?.usage ?? { inputTokens: 0, outputTokens: 0 },
    costUSD: result?.costUSD ?? (inputTokens / 1e6) * price,
    ...(error ? { error: String((error as Error).message ?? error) } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
    stateText: state.text,
  }
  return { appliedTier: outcome.appliedTier, targetModel, record, state, ...(result ? { result } : {}) }
}

/** Creates the configured router (or the named one). */
export async function createRouter(config: Config, name: RouterName = config.router): Promise<Router> {
  switch (name) {
    case "systemone":
      return systemOneRouter(config.systemOne)
    case "jev": {
      const apiKey = process.env[config.jev.apiKeyEnv]
      if (!apiKey) throw new Error(`the jev router needs an API key in $${config.jev.apiKeyEnv}`)
      return systemOneRouter({ ...config.jev, name: "jev", apiKey })
    }
    case "embedding": {
      const { embeddingRouter } = await import("./embedding.ts")
      return embeddingRouter(config.embedding)
    }
    case "llm": {
      const { llmRouter } = await import("./llm.ts")
      return llmRouter(config.llm)
    }
  }
}
