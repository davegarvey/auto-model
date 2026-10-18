import assert from "node:assert/strict"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { after, test } from "node:test"
import type { Tier } from "./config.ts"
import { DEFAULT_CONFIDENCE, llmRouter, parseLlmAnswer } from "./llm.ts"
import { RouterError } from "./router.ts"
import { buildState } from "./state.ts"

const menu: Tier[] = [
  { id: "small", description: "Simple things.", model: "ollama/a" },
  { id: "large", description: "Hard things.", model: "ollama/b" },
]

let content = ""
let lastBody: any
const server = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    lastBody = JSON.parse(body)
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ message: { role: "assistant", content }, prompt_eval_count: 321, eval_count: 12 }))
  })
})
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
after(() => server.close())
const router = llmRouter({ baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, model: "stub", timeoutMs: 2000 })
const state = buildState({ history: [], latestMessage: "Why does this deadlock?" }, { budgetTokens: 8192 })

test("a valid structured answer gives the tier and the model's confidence", async () => {
  content = '{"tier": "large", "confidence": 0.9}'
  const result = await router.route(menu, state)
  assert.equal(result.tier, "large")
  assert.equal(result.confidence, 0.9)
  assert.deepEqual(result.usage, { inputTokens: 321, outputTokens: 12 })
  assert.equal(result.scores, undefined)
})

test("the request lists tier descriptions, constrains the output and turns thinking off", async () => {
  assert.equal(lastBody.think, false)
  assert.deepEqual(lastBody.format.properties.tier.enum, ["small", "large"])
  assert.match(lastBody.messages[0].content, /- small: Simple things\./)
  assert.match(lastBody.messages[1].content, /Why does this deadlock\?/)
  assert.doesNotMatch(JSON.stringify(lastBody.messages), /ollama\//)
})

test("missing or out-of-range confidence uses the documented default or is clamped", () => {
  assert.equal(parseLlmAnswer('{"tier":"small"}', menu).confidence, DEFAULT_CONFIDENCE)
  assert.equal(parseLlmAnswer('{"tier":"small","confidence":7}', menu).confidence, 1)
  assert.equal(parseLlmAnswer('```json\n{"tier":"small","confidence":0.3}\n```', menu).confidence, 0.3)
})

test("malformed output is reported as an invalid response", async () => {
  for (const bad of ["not json", '{"tier":"huge","confidence":0.9}', '{"confidence":0.9}']) {
    content = bad
    await assert.rejects(router.route(menu, state), (e: unknown) => e instanceof RouterError && e.kind === "invalid-response")
  }
})
