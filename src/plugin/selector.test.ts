import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { loadConfig } from "../core/config.ts"
import type { DecisionRecord } from "../core/log.ts"
import { RouterError, type Router } from "../core/router.ts"
import type { SessionMessage } from "./history.ts"
import { parseRef, refToString, Selector, type ModelRef, type SessionPort } from "./selector.ts"

const config = loadConfig(path.resolve(import.meta.dirname, "../../auto-model.config.json"))

/** A router that answers from a queue of tiers, or fails when given an Error. */
function stubRouter(answers: Array<string | Error>): Router {
  return {
    name: "stub",
    model: "stub-1",
    async route() {
      const next = answers.shift() ?? "medium"
      if (next instanceof Error) throw next
      const scores = { small: 0.05, medium: 0.05, large: 0.05, [next]: 0.9 }
      return { tier: next, confidence: 0.85, scores, usage: { inputTokens: 10, outputTokens: 0 }, latencyMs: 3 }
    },
  }
}

function harness(answers: Array<string | Error>, start?: ModelRef, parentID?: string) {
  const sessions = new Map<string, { model?: ModelRef; parentID?: string; messages: SessionMessage[] }>()
  const switches: string[] = []
  const records: DecisionRecord[] = []
  const port: SessionPort = {
    async get(id) {
      const s = sessions.get(id)!
      return { ...(s.model ? { model: s.model } : {}), ...(s.parentID ? { parentID: s.parentID } : {}) }
    },
    async context(id) {
      return sessions.get(id)!.messages
    },
    async switchModel(id, model) {
      sessions.get(id)!.model = model
      switches.push(`${id} -> ${refToString(model)}`)
    },
  }
  const selector = new Selector(config, stubRouter(answers), port, async (r) => void records.push(r), () => {})
  const add = (id: string, model = start, parent = parentID) =>
    sessions.set(id, { ...(model ? { model } : {}), ...(parent ? { parentID: parent } : {}), messages: [] })
  add("ses_a")
  return { selector, sessions, switches, records, add }
}

test("a simple prompt switches to the small tier before the turn runs", async () => {
  const h = harness(["small"], parseRef("ollama/qwen3.6:35b-mlx#none"))
  const record = await h.selector.onPrompt("ses_a", "rename cnt to count")
  assert.deepEqual(h.switches, ["ses_a -> ollama/gemma4:e2b-mlx#none"])
  assert.equal(record?.appliedTier, "small")
  assert.equal(record?.previousTier, "medium")
  assert.equal(record?.switched, true)
  assert.equal(h.records.length, 1)
})

test("no switch when the tier is unchanged", async () => {
  const h = harness(["medium"], parseRef("ollama/qwen3.6:35b-mlx#none"))
  const record = await h.selector.onPrompt("ses_a", "add a test")
  assert.deepEqual(h.switches, [])
  assert.equal(record?.switched, false)
})

test("a hand-picked model pauses routing until /auto-model on", async () => {
  const h = harness(["large", "small", "small"], parseRef("ollama/qwen3.6:35b-mlx#none"))
  await h.selector.onPrompt("ses_a", "design the cache")
  h.sessions.get("ses_a")!.model = parseRef("openai/some-model")
  const override = await h.selector.onPrompt("ses_a", "keep going")
  assert.equal(override?.reason, "manual-override")
  assert.equal(override?.targetModel, "openai/some-model")
  assert.equal(await h.selector.onPrompt("ses_a", "and again"), undefined)
  assert.equal(h.sessions.get("ses_a")!.model!.providerID, "openai")
  assert.match(h.selector.command("ses_a", "status"), /paused/)

  h.selector.command("ses_a", "on")
  const resumed = await h.selector.onPrompt("ses_a", "small thing")
  assert.equal(resumed?.appliedTier, "small")
  assert.equal(h.sessions.get("ses_a")!.model!.id, "gemma4:e2b-mlx")
})

test("/auto-model off leaves the model alone", async () => {
  const h = harness(["small"], parseRef("ollama/qwen3.6:35b-mlx#none"))
  h.selector.command("ses_a", "off")
  assert.equal(await h.selector.onPrompt("ses_a", "rename"), undefined)
  assert.deepEqual(h.switches, [])
})

test("disabled in configuration makes no decisions", async () => {
  const h = harness(["small"])
  const off = new Selector({ ...config, enabled: false }, stubRouter(["small"]), h.selector.port, async () => {}, () => {})
  assert.equal(await off.onPrompt("ses_a", "rename"), undefined)
})

test("a sub-agent session is routed on its own and records its parent", async () => {
  const h = harness(["large", "small"], parseRef("ollama/qwen3.6:35b-mlx#none"))
  await h.selector.onPrompt("ses_a", "investigate the flaky test")
  h.add("ses_child", parseRef("ollama/qwen3.6:35b-mlx#high"), "ses_a")
  const child = await h.selector.onPrompt("ses_child", "find where retries are configured")
  assert.equal(child?.parentSessionID, "ses_a")
  assert.equal(child?.appliedTier, "small")
  assert.equal(child?.previousTier, "large")
  assert.equal(h.sessions.get("ses_a")!.model!.variant, "high")
})

test("router failure keeps the current tier and does not throw", async () => {
  const h = harness([new RouterError("unavailable", "connection refused")], parseRef("ollama/qwen3.6:35b-mlx#high"))
  const record = await h.selector.onPrompt("ses_a", "anything")
  assert.equal(record?.reason, "endpoint-error")
  assert.equal(record?.appliedTier, "large")
  assert.deepEqual(h.switches, [])
})

test("status lines written by the plugin are not routed or included in state", async () => {
  const h = harness(["small"], parseRef("ollama/qwen3.6:35b-mlx#none"))
  assert.equal(await h.selector.onPrompt("ses_a", "[auto-model] routing on"), undefined)
  h.sessions.get("ses_a")!.messages.push({ type: "synthetic", text: "[auto-model] routing on" })
  const record = await h.selector.onPrompt("ses_a", "rename")
  assert.doesNotMatch(record?.stateText ?? "", /routing on/)
})

test("model references round-trip", () => {
  for (const s of ["ollama/qwen3.6:35b-mlx#high", "ollama/gemma4:e2b-mlx", "openai/gpt-x#max"])
    assert.equal(refToString(parseRef(s)), s)
})
