// Turns a router's proposal into the tier actually applied: endpoint errors keep the current tier,
// low confidence falls back to the default, and hysteresis stops marginal switches.
import type { Reason } from "./log.ts"
import type { RouterResult } from "./router.ts"

export interface PolicyInput {
  result?: RouterResult
  /** Set when the router failed; `result` is then ignored. */
  error?: unknown
  currentTier?: string
  tiers: string[]
  defaultTier: string
  threshold: number
  margin: number
}

export interface PolicyOutcome {
  appliedTier: string
  proposedTier?: string
  reason: Reason
}

/** Probability the router gave a tier; without per-tier scores, the rest of the mass is spread evenly. */
function probability(result: RouterResult, tier: string, tierCount: number): number {
  if (result.scores && tier in result.scores) return result.scores[tier]
  if (tier === result.tier) return result.confidence
  return (1 - result.confidence) / Math.max(1, tierCount - 1)
}

export function applyPolicy(input: PolicyInput): PolicyOutcome {
  const { result, currentTier, defaultTier } = input
  if (input.error !== undefined || !result) return { appliedTier: currentTier ?? defaultTier, reason: "endpoint-error" }

  const proposedTier = result.tier
  if (result.confidence < input.threshold)
    return { appliedTier: defaultTier, proposedTier, reason: "low-confidence-fallback" }

  if (currentTier !== undefined && proposedTier !== currentTier) {
    const n = input.tiers.length
    const lead = probability(result, proposedTier, n) - probability(result, currentTier, n)
    // Small tolerance so a lead of exactly the margin, after float rounding, still counts.
    if (lead < input.margin - 1e-9) return { appliedTier: currentTier, proposedTier, reason: "hysteresis-hold" }
  }
  return { appliedTier: proposedTier, proposedTier, reason: "decision" }
}
