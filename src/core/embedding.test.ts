import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import type { Tier } from "./config.ts"
import { embeddingRouter, embeddingText, latestMessageText } from "./embedding.ts"
import { buildState } from "./state.ts"

const menu: Tier[] = [
  { id: "small", description: "s", model: "ollama/a" },
  { id: "medium", description: "m", model: "ollama/b" },
  { id: "large", description: "l", model: "ollama/c" },
]

// Stub embedding: a vector counting the marker words, so similarity is predictable.
const vector = (text: string) => ["tiny", "routine", "gnarly"].map((w) => text.split(w).length - 1 + 0.01)
let requests = 0
let lastInputs: string[] = []
const server = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    requests++
    lastInputs = JSON.parse(body).input
    const tokens = lastInputs.reduce((n, t) => n + Math.ceil(t.length / 4), 0)
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ embeddings: lastInputs.map(vector), prompt_eval_count: tokens }))
  })
})
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
after(() => server.close())
const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const dir = await mkdtemp(path.join(tmpdir(), "emb-"))
const examples = path.join(dir, "examples.jsonl")
await writeFile(
  examples,
  [
    ...["tiny one", "tiny two", "tiny three"].map((t, i) => ({ id: `s${i}`, label: "small", text: t })),
    ...["routine one", "routine two"].map((t, i) => ({ id: `m${i}`, label: "medium", text: t })),
    ...["gnarly one", "gnarly two"].map((t, i) => ({ id: `l${i}`, label: "large", text: t })),
  ]
    .map((e) => JSON.stringify(e))
    .join("\n"),
)

const router = embeddingRouter({ baseURL, model: "stub-embed", examples, k: 3, timeoutMs: 2000, contextTokens: 2048 })
const state = (latest: string, history: { from: "user" | "assistant"; text: string }[] = []) =>
  buildState({ history, latestMessage: latest }, { budgetTokens: 8192 })

test("classifies by the nearest labelled examples with a similarity-weighted confidence", async () => {
  const result = await router.route(menu, state("a tiny tiny request"))
  assert.equal(result.tier, "small")
  assert.ok(result.confidence > 0.5 && result.confidence <= 1)
  assert.ok(result.scores!.small > result.scores!.medium)
  assert.equal(Math.round(Object.values(result.scores!).reduce((a, b) => a + b, 0) * 1000), 1000)
  assert.ok(result.usage.inputTokens > 0)
})

test("examples are embedded once and reused", async () => {
  const before = requests
  await router.route(menu, state("gnarly gnarly"))
  await router.route(menu, state("routine routine"))
  assert.equal(requests - before, 2)
})

test("embeds the same multi-turn state as the System One router, newest first", async () => {
  const s = state("now fix it", [
    { from: "user", text: "gnarly gnarly gnarly race condition" },
    { from: "assistant", text: "found the cause" },
  ])
  const result = await router.route(menu, s)
  assert.equal(result.tier, "large", "earlier turns shape the decision")
  const text = lastInputs[0]
  assert.ok(text.indexOf("now fix it") < text.indexOf("found the cause"))
  assert.ok(text.indexOf("found the cause") < text.indexOf("race condition"))
  assert.equal(text, embeddingText(s))
})

test("input that fills the embedding model's context is flagged as truncated", async () => {
  const long = embeddingRouter({ baseURL, model: "stub-embed", examples, k: 3, timeoutMs: 2000, contextTokens: 50 })
  const result = await long.route(menu, state("tiny " + "x".repeat(400)))
  assert.equal(result.inputTruncated, true)
})

test("the latest-message variant embeds only the message being routed, prefixed like the examples", async () => {
  const latest = embeddingRouter({ baseURL, model: "stub-embed", examples, k: 3, timeoutMs: 2000, input: "latest" })
  const s = state("now fix it", [{ from: "user", text: "gnarly gnarly gnarly race condition" }])
  await latest.route(menu, s)
  assert.equal(latest.name, "embedding-latest")
  assert.equal(lastInputs[0], "task: classification | query: now fix it")
  assert.equal(lastInputs[0], latestMessageText(s))
  assert.equal(router.name, "embedding", "the full-state default is unchanged")
})
