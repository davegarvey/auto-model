import assert from "node:assert/strict"
import { test } from "node:test"
import { applyPolicy, type PolicyInput } from "./policy.ts"
import type { RouterResult } from "./router.ts"

const result = (tier: string, confidence: number, scores?: Record<string, number>): RouterResult => ({
  tier,
  confidence,
  ...(scores ? { scores } : {}),
  usage: { inputTokens: 0, outputTokens: 0 },
  latencyMs: 1,
})

const base: Omit<PolicyInput, "result"> = {
  tiers: ["small", "medium", "large"],
  defaultTier: "medium",
  threshold: 0.5,
  margin: 0.15,
}

test("confidence below the threshold falls back to the default tier", () => {
  const out = applyPolicy({ ...base, result: result("small", 0.3) })
  assert.deepEqual(out, { appliedTier: "medium", proposedTier: "small", reason: "low-confidence-fallback" })
})

test("confidence at the threshold is accepted", () => {
  assert.equal(applyPolicy({ ...base, result: result("small", 0.5) }).appliedTier, "small")
})

test("a marginal preference keeps the current tier", () => {
  const out = applyPolicy({
    ...base,
    currentTier: "medium",
    result: result("large", 0.6, { small: 0.15, medium: 0.4, large: 0.45 }),
  })
  assert.deepEqual(out, { appliedTier: "medium", proposedTier: "large", reason: "hysteresis-hold" })
})

test("a clear preference switches tier", () => {
  const out = applyPolicy({
    ...base,
    currentTier: "medium",
    result: result("large", 0.7, { small: 0.1, medium: 0.2, large: 0.7 }),
  })
  assert.deepEqual(out, { appliedTier: "large", proposedTier: "large", reason: "decision" })
})

test("a lead of exactly the margin switches", () => {
  const out = applyPolicy({
    ...base,
    currentTier: "medium",
    result: result("large", 0.55, { small: 0.05, medium: 0.4, large: 0.55 }),
  })
  assert.equal(out.reason, "decision")
})

test("first turn of a session: no hysteresis, only the fallback", () => {
  const marginal = result("large", 0.6, { small: 0.15, medium: 0.4, large: 0.45 })
  assert.equal(applyPolicy({ ...base, result: marginal }).appliedTier, "large")
})

test("endpoint error keeps the current tier, or the default if there is none", () => {
  assert.deepEqual(applyPolicy({ ...base, currentTier: "large", error: new Error("down") }), {
    appliedTier: "large",
    reason: "endpoint-error",
  })
  assert.equal(applyPolicy({ ...base, error: new Error("down") }).appliedTier, "medium")
})

test("routers without per-tier scores spread the remaining probability evenly", () => {
  // proposed 0.6, current (1 - 0.6) / 2 = 0.2: lead 0.4 >= 0.15
  assert.equal(applyPolicy({ ...base, currentTier: "small", result: result("large", 0.6) }).reason, "decision")
  // proposed 0.5, current 0.25: lead 0.25 >= 0.15 still switches; with margin 0.3 it holds
  assert.equal(
    applyPolicy({ ...base, margin: 0.3, currentTier: "small", result: result("large", 0.5) }).reason,
    "hysteresis-hold",
  )
})
