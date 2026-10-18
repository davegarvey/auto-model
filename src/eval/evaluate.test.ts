import assert from "node:assert/strict"
import { test } from "node:test"
import { parseConfig } from "../core/config.ts"
import { RouterError, type Router } from "../core/router.ts"
import type { Dataset } from "./dataset.ts"
import { evaluate } from "./evaluate.ts"
import { wilson } from "./stats.ts"

const config = parseConfig({
  tiers: [
    { id: "small", description: "s", model: "ollama/a" },
    { id: "medium", description: "m", model: "ollama/b" },
    { id: "large", description: "l", model: "ollama/c" },
  ],
  defaultTier: "medium",
  policy: { threshold: 0.4, margin: 0.15 },
})

const longFirstTurn = "The checkout test fails one run in ten and nobody knows why. " + "Details. ".repeat(250)

const dataset: Dataset = {
  prompts: [
    { id: "p1", text: "what port", label: "small" },
    { id: "p2", text: "add a flag", label: "medium" },
    { id: "p3", text: "design a cache", label: "large" },
  ],
  sessions: [
    {
      id: "s",
      title: "fixture",
      turns: [
        { user: longFirstTurn, assistant: "A race with the mock server.", label: "large" },
        { user: "now fix it", assistant: "Fixed.", label: "large" },
        { user: "rename the helper", assistant: "", label: "small" },
      ],
    },
  ],
}

// Answers keyed on the latest message: [tier, confidence, scores]
const answers: Record<string, [string, number, Record<string, number>]> = {
  "what port": ["small", 0.9, { small: 0.93, medium: 0.04, large: 0.03 }],
  "add a flag": ["large", 0.3, { small: 0.2, medium: 0.33, large: 0.47 }],
  "design a cache": ["large", 0.8, { small: 0.03, medium: 0.1, large: 0.87 }],
  [longFirstTurn]: ["large", 0.9, { small: 0.03, medium: 0.04, large: 0.93 }],
  "now fix it": ["medium", 0.5, { small: 0.15, medium: 0.45, large: 0.4 }],
  "rename the helper": ["small", 0.9, { small: 0.9, medium: 0.05, large: 0.05 }],
}

const stub = (name: string): Router => ({
  name,
  model: `${name}-model`,
  async route(_menu, state) {
    const [tier, confidence, scores] = answers[state.value.latest_message] ?? ["medium", 0.5, { small: 0.25, medium: 0.5, large: 0.25 }]
    return { tier, confidence, scores, usage: { inputTokens: 100, outputTokens: 1 }, latencyMs: 10, modelVersion: `${name}-v1` }
  },
})

const failing: Router = {
  name: "broken",
  model: "none",
  async route() {
    throw new RouterError("unavailable", "down")
  },
}

const result = await evaluate({ config, routers: [stub("systemone"), failing], dataset, stateBudgets: [256, 8192] })
const s1 = result.summaries[0]

test("agreement counts proposals against labels, separately for prompts and turns", () => {
  assert.equal(s1.prompts.agree, 2)
  assert.equal(s1.prompts.n, 3)
  assert.equal(s1.turns.agree, 2)
  assert.equal(s1.overall.agree, 4)
  assert.equal(s1.overall.n, 6)
  assert.deepEqual(s1.overall.ci, wilson(4, 6))
  assert.equal(s1.modelVersion, "systemone-v1")
})

test("applied agreement reflects the fallback and hysteresis", () => {
  // p2 falls back to medium (correct); turn 2's marginal medium is held at large (correct).
  assert.equal(s1.applied.agree, 6)
})

test("the confusion matrix places each proposal against its label", () => {
  assert.equal(s1.confusion.medium.large, 1)
  assert.equal(s1.confusion.large.medium, 1)
  assert.equal(s1.confusion.small.small, 2)
  assert.equal(s1.confusion.large.large, 2)
})

test("latency, tokens and cost are summarised", () => {
  assert.deepEqual(s1.latency, { median: 10, p95: 10 })
  assert.deepEqual(s1.tokens, { input: 600, output: 6 })
  assert.equal(s1.costUSD, 0)
})

test("the threshold sweep reports agreement after fallback and the fallback rate", () => {
  const at = (t: number) => s1.thresholdSweep.find((r) => r.threshold === t)!
  assert.equal(at(0).agreement.agree, 4)
  assert.equal(at(0).fallbackRate, 0)
  assert.equal(at(0.4).agreement.agree, 5)
  assert.equal(at(0.4).fallbackRate, 1 / 6)
  assert.equal(at(0.6).fallbackRate, 2 / 6)
  // Confidence 0.9 is not below 0.9: p1, t1 and t3 keep their (correct) proposals; p2 falls back correctly,
  // p3 and t2 fall back to medium against a large label.
  assert.equal(at(0.9).agreement.agree, 4)
  assert.equal(at(0.9).fallbackRate, 3 / 6)
})

test("the session simulation counts switches with and without hysteresis", () => {
  const [sim] = s1.sessions
  assert.equal(sim.turns, 3)
  assert.deepEqual([sim.withHysteresis.agreement.agree, sim.withHysteresis.switches], [3, 1])
  assert.deepEqual([sim.withoutHysteresis.agreement.agree, sim.withoutHysteresis.switches], [2, 2])
})

test("the state-size sweep runs every turn at each budget and shows truncation", () => {
  assert.equal(result.stateSize?.router, "systemone")
  const [small, large] = result.stateSize!.rows
  assert.equal(small.budgetTokens, 256)
  assert.equal(small.agreement.n, 3)
  assert.ok(small.truncatedTurns > 0)
  assert.equal(large.truncatedTurns, 0)
  assert.ok(large.medianStateTokens > small.medianStateTokens)
})

test("a failing router is recorded as errors and falls back to the default tier", () => {
  const broken = result.summaries[1]
  assert.equal(broken.errors, 6)
  assert.equal(broken.overall.agree, 0)
  assert.equal(broken.confusion.small.error, 2)
  assert.equal(broken.applied.agree, 1) // only p2 is labelled medium, the default
})

test("every decision is kept, tagged with its run and case", () => {
  const runs = new Set(result.decisions.map((d) => d.meta?.run))
  assert.deepEqual([...runs].sort(), ["main", "no-hysteresis", "state-size"])
  assert.ok(result.decisions.every((d) => d.meta?.case && d.meta?.label))
  // 2 routers x (3 prompts + 2 x 3 turns) + 2 budgets x 3 turns
  assert.equal(result.decisions.length, 2 * 9 + 6)
})

test("overlap with router examples stops the evaluation", async () => {
  await assert.rejects(
    evaluate({
      config,
      routers: [stub("systemone")],
      dataset,
      routerExamples: [{ id: "s01", label: "small", text: "What port?" }],
    }),
    /overlap/,
  )
})
