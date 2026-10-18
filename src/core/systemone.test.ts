import assert from "node:assert/strict"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { after, test } from "node:test"
import type { Tier } from "./config.ts"
import { RouterError } from "./router.ts"
import { buildState } from "./state.ts"
import { systemOneRouter } from "./systemone.ts"

const menu: Tier[] = [
  { id: "small", description: "Simple things.", model: "ollama/a" },
  { id: "large", description: "Hard things.", model: "ollama/b" },
]
const state = buildState({ history: [], latestMessage: "Why does this deadlock?" }, { budgetTokens: 8192 })

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void
let handler: Handler = () => {}
let lastBody: any
const server = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    lastBody = body ? JSON.parse(body) : undefined
    handler(req, body, res)
  })
})
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
after(() => server.close())

const reply = (status: number, body: unknown) => (_req: IncomingMessage, _b: string, res: ServerResponse) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(typeof body === "string" ? body : JSON.stringify(body))
}

const router = (timeoutMs = 2000) => systemOneRouter({ baseURL, model: "kev-latest", timeoutMs })

const kind = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof RouterError, `expected RouterError, got ${error}`)
    return error.kind
  }
  assert.fail("expected the router to fail")
}

test("successful decision returns tier, confidence, probabilities and usage", async () => {
  handler = reply(200, {
    model: "kev-4b-1.0",
    answers: { tier: { type: "choice", choice: "large", confidence: 0.8, probabilities: { small: 0.1, large: 0.9 } } },
    usage: { input_tokens: 412, output_tokens: 1 },
  })
  const result = await router().route(menu, state)
  assert.equal(result.tier, "large")
  assert.equal(result.confidence, 0.8)
  assert.deepEqual(result.scores, { small: 0.1, large: 0.9 })
  assert.deepEqual(result.usage, { inputTokens: 412, outputTokens: 1 })
  assert.equal(result.modelVersion, "kev-4b-1.0")
  assert.ok(result.latencyMs >= 0)
})

test("request sends the state and a choice question over tier descriptions", async () => {
  await router().route(menu, state)
  assert.equal(lastBody.model, "kev-latest")
  assert.deepEqual(lastBody.state, state.value)
  assert.equal(lastBody.questions.tier.type, "choice")
  assert.deepEqual(lastBody.questions.tier.criteria, { small: "Simple things.", large: "Hard things." })
  assert.doesNotMatch(JSON.stringify(lastBody.questions), /ollama\//)
})

test("error status is reported as unavailable", async () => {
  handler = reply(500, { detail: "boom" })
  assert.equal(await kind(router().route(menu, state)), "unavailable")
})

test("a slow endpoint times out", async () => {
  handler = (_req, _b, res) => setTimeout(() => reply(200, {})(_req, _b, res), 500)
  assert.equal(await kind(router(100).route(menu, state)), "timeout")
})

test("malformed bodies are rejected", async () => {
  handler = reply(200, "not json")
  assert.equal(await kind(router().route(menu, state)), "invalid-response")
  handler = reply(200, { answers: { tier: { type: "choice", choice: "medium", confidence: 0.9 } } })
  assert.equal(await kind(router().route(menu, state)), "invalid-response")
  handler = reply(200, { answers: { tier: { type: "choice", choice: "small", confidence: 2 } } })
  assert.equal(await kind(router().route(menu, state)), "invalid-response")
})

test("an endpoint that is not running is unavailable", async () => {
  const down = systemOneRouter({ baseURL: "http://127.0.0.1:9", model: "kev-latest", timeoutMs: 2000 })
  assert.equal(await kind(down.route(menu, state)), "unavailable")
})

test("the hosted Jev variant posts to its own path with a bearer key and reports the service's cost", async () => {
  let seen: { url?: string; auth?: string } = {}
  handler = (req, _b, res) => {
    seen = { url: req.url, auth: req.headers.authorization }
    reply(200, {
      model: "typesafe/jev-1.13-20260917",
      answers: { tier: { type: "choice", choice: "large", probabilities: { small: 0.1, large: 0.9 }, confidence: 0.8 } },
      usage: { input_tokens: 400, output_tokens: 38, cost: 0.0000336 },
    })(req, _b, res)
  }
  const jev = systemOneRouter({ baseURL, model: "typesafe/jev-1.13", timeoutMs: 2000, name: "jev", path: "/api/v1/decisions", apiKey: "test-key" })
  const result = await jev.route(menu, state)
  assert.equal(jev.name, "jev")
  assert.equal(seen.url, "/api/v1/decisions")
  assert.equal(seen.auth, "Bearer test-key")
  assert.equal(lastBody.model, "typesafe/jev-1.13")
  assert.equal(result.tier, "large")
  assert.equal(result.costUSD, 0.0000336)
  assert.equal(result.modelVersion, "typesafe/jev-1.13-20260917")
})

test("the local Kev router sends no authorization header", async () => {
  let auth: string | undefined = "unset"
  handler = (req, _b, res) => {
    auth = req.headers.authorization
    reply(200, { answers: { tier: { type: "choice", choice: "small", confidence: 0.5 } } })(req, _b, res)
  }
  await router().route(menu, state)
  assert.equal(auth, undefined)
})
