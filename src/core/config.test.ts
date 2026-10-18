import assert from "node:assert/strict"
import { homedir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { ConfigError, loadConfig, parseConfig } from "./config.ts"

const repoConfig = path.resolve(import.meta.dirname, "../../auto-model.config.json")

const tiers = [
  { id: "small", description: "Simple things.", model: "ollama/a", variant: "none" },
  { id: "large", description: "Hard things.", model: "ollama/b", variant: "high" },
]

const rule = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof ConfigError, `expected ConfigError, got ${error}`)
    return error.rule
  }
  assert.fail("expected parseConfig to throw")
}

test("shipped configuration has the three-tier menu", () => {
  const config = loadConfig(repoConfig)
  assert.deepEqual(
    config.tiers.map((t) => t.id),
    ["small", "medium", "large"],
  )
  for (const tier of config.tiers) {
    assert.ok(tier.description.length > 20)
    assert.match(tier.model, /^ollama\//)
    assert.ok(tier.variant)
  }
  assert.equal(config.defaultTier, "medium")
  assert.equal(config.log.path, path.join(homedir(), ".local/state/auto-model/decisions.jsonl"))
  assert.equal(config.embedding.examples, path.resolve(path.dirname(repoConfig), "data/router-examples.jsonl"))
})

test("valid minimal configuration fills defaults", () => {
  const config = parseConfig({ tiers, defaultTier: "small" }, "/tmp")
  assert.equal(config.router, "systemone")
  assert.equal(config.policy.threshold, 0.4)
  assert.equal(config.state.budgetTokens, 8192)
  assert.equal(config.systemOne.timeoutMs, 30000)
  assert.equal(config.enabled, true)
})

test("changing a tier's model needs no code change", () => {
  const edited = tiers.map((t) => (t.id === "small" ? { ...t, model: "ollama/other" } : t))
  assert.equal(parseConfig({ tiers: edited, defaultTier: "small" }).tiers[0].model, "ollama/other")
})

test("duplicate tier is rejected", () => {
  assert.equal(rule(() => parseConfig({ tiers: [...tiers, tiers[0]], defaultTier: "small" })), "duplicate-tier")
})

test("missing or unknown default tier is rejected", () => {
  assert.equal(rule(() => parseConfig({ tiers })), "missing-default")
  assert.equal(rule(() => parseConfig({ tiers, defaultTier: "medium" })), "missing-default")
})

test("fewer than two tiers is rejected", () => {
  assert.equal(rule(() => parseConfig({ tiers: [tiers[0]], defaultTier: "small" })), "too-few-tiers")
})

test("malformed fields are rejected with the broken rule", () => {
  assert.equal(rule(() => parseConfig({ tiers, defaultTier: "small", router: "magic" })), "invalid-router")
  assert.equal(
    rule(() => parseConfig({ tiers, defaultTier: "small", policy: { threshold: 1.5 } })),
    "out-of-range",
  )
  assert.equal(rule(() => parseConfig({ tiers, defaultTier: "small", policy: { margin: "0.1" } })), "invalid-field")
  assert.equal(
    rule(() => parseConfig({ tiers: [{ ...tiers[0], model: "nomodel" }, tiers[1]], defaultTier: "small" })),
    "invalid-tier",
  )
  assert.equal(
    rule(() => parseConfig({ tiers: [{ ...tiers[0], description: " " }, tiers[1]], defaultTier: "small" })),
    "invalid-tier",
  )
})

test("embedding.input must be state or latest, defaulting to state", () => {
  const base = { tiers: [{ id: "a", description: "A", model: "x/a" }, { id: "b", description: "B", model: "x/b" }], defaultTier: "a" }
  assert.equal(parseConfig(base, "/").embedding.input, "state")
  assert.equal(parseConfig({ ...base, embedding: { input: "latest" } }, "/").embedding.input, "latest")
  assert.throws(() => parseConfig({ ...base, embedding: { input: "everything" } }, "/"), /embedding.input/)
})
