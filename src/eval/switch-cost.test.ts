import assert from "node:assert/strict"
import { test } from "node:test"
import { DESIGNS, makeContext, renderSwitchCost, runBenchmark, type Endpoint, type OllamaClient } from "./switch-cost.ts"

/**
 * A stub Ollama: each loaded model caches its last prompt. Reading a prompt costs 1 ms per estimated token,
 * except the part shared with the cached prompt. gpt-oss puts the effort level at the top of the prompt, so
 * changing it invalidates everything; the other models put thinking at the end, so toggling it reuses the cache.
 */
function stubOllama(): OllamaClient & { calls: string[] } {
  const loaded = new Map<string, { prompt: string; think: string }>()
  const calls: string[] = []
  return {
    calls,
    async chat(e: Endpoint, prompt: string) {
      calls.push(`chat ${e.model}`)
      const load = loaded.has(e.model) ? 0 : 1000
      const cached = loaded.get(e.model)
      const think = String(e.think)
      const effortAtTop = e.model.startsWith("gpt-oss")
      let shared = 0
      if (cached && !(effortAtTop && cached.think !== think))
        while (shared < prompt.length && prompt[shared] === cached.prompt[shared]) shared++
      loaded.set(e.model, { prompt, think })
      const tokens = Math.ceil(prompt.length / 3.5)
      return { loadMs: load, promptMs: Math.ceil((prompt.length - shared) / 3.5), promptTokens: tokens, wallMs: 0 }
    },
    async unload(model: string) {
      calls.push(`unload ${model}`)
      loaded.delete(model)
    },
  }
}

const text = "user: the checkout test is flaky\nassistant: a race with the mock server. ".repeat(50)

test("contexts carry a nonce and roughly the requested size", () => {
  const a = makeContext(text, 1000, "n1")
  const b = makeContext(text, 1000, "n2")
  assert.notEqual(a.slice(0, 20), b.slice(0, 20))
  assert.ok(Math.abs(a.length / 3.5 - 1000) < 40)
})

test("the benchmark tells cache reuse from re-reading, and counts load time", async () => {
  const client = stubOllama()
  const rows = await runBenchmark({ client, text, sizes: [1000, 4000], reps: 3, designs: DESIGNS })
  const row = (design: string, kind: string, size: number, to?: string) =>
    rows.find((r) => r.design === design && r.transition === kind && r.contextTokens === size && (!to || r.to.startsWith(to)))!

  for (const size of [1000, 4000]) {
    assert.ok(row("mixed-family", "baseline", size).reprocessedShare < 0.05, "same model, same setting: cache reused")
    assert.ok(row("mixed-family", "thinking-toggled", size).reprocessedShare < 0.05, "thinking at the end: reused")
    assert.ok(row("single-model", "effort-changed", size).reprocessedShare > 0.95, "effort at the top: re-read")
    const loaded = row("mixed-family", "other-model-loaded", size, "qwen")
    assert.ok(loaded.reprocessedShare > 0.95, "another model never shares a cache")
    assert.equal(loaded.loadMs, 0)
    const unloaded = row("same-family", "other-model-unloaded", size)
    assert.ok(unloaded.reprocessedShare > 0.95)
    assert.equal(unloaded.loadMs, 1000)
    assert.equal(unloaded.firstTokenMs, 1000 + unloaded.promptMs)
  }
  assert.ok(row("same-family", "other-model-loaded", 4000).promptMs > row("same-family", "other-model-loaded", 1000).promptMs)
  assert.equal(rows.length, 2 * DESIGNS.reduce((n, d) => n + d.transitions.length, 0))
  assert.ok(rows.every((r) => r.reps === 3))
})

test("every model of a design is unloaded before and after it runs", async () => {
  const client = stubOllama()
  await runBenchmark({ client, text, sizes: [500], reps: 1, designs: [DESIGNS[2]] })
  assert.equal(client.calls[0], "unload gpt-oss:20b")
  assert.equal(client.calls.at(-1), "unload gpt-oss:20b")
})

test("the markdown report lists each design's transitions", async () => {
  const rows = await runBenchmark({ client: stubOllama(), text, sizes: [500], reps: 1, designs: DESIGNS })
  const md = renderSwitchCost(rows, { date: "2026-10-18", reps: 1, source: "fixture" })
  for (const needle of ["## mixed-family", "## same-family", "## single-model", "thinking-toggled", "effort-changed", "other-model-unloaded", "reprocessed"])
    assert.ok(md.includes(needle), needle)
})
