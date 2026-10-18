import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { appendDecision, type DecisionRecord } from "./log.ts"

const record = (overrides: Partial<DecisionRecord> = {}): DecisionRecord => ({
  ts: "2026-10-18T10:00:00.000Z",
  sessionID: "ses_1",
  router: "systemone",
  decisionModel: "kev-latest",
  proposedTier: "large",
  appliedTier: "large",
  targetModel: "ollama/qwen3.6:35b-mlx#high",
  previousTier: "medium",
  confidence: 0.72,
  probabilities: { small: 0.05, medium: 0.23, large: 0.72 },
  reason: "decision",
  switched: true,
  latencyMs: 640,
  state: { estimatedTokens: 812, chars: 2841, truncated: false, droppedMessages: 0 },
  usage: { inputTokens: 830, outputTokens: 0 },
  costUSD: 0,
  stateText: '{"latest_message":"secret prompt"}',
  ...overrides,
})

const lines = async (file: string) => (await readFile(file, "utf8")).trimEnd().split("\n")

test("one complete JSON line is appended per decision", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "log-")), "nested/decisions.jsonl")
  await appendDecision(file, record(), { captureState: false })
  await appendDecision(file, record({ sessionID: "ses_2" }), { captureState: false })
  const out = await lines(file)
  assert.equal(out.length, 2)
  const first = JSON.parse(out[0])
  assert.equal(first.appliedTier, "large")
  assert.equal(first.confidence, 0.72)
  assert.equal(first.switched, true)
  assert.equal(first.previousTier, "medium")
  assert.equal(JSON.parse(out[1]).sessionID, "ses_2")
})

test("concurrent writers produce separate, complete lines", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "log-")), "decisions.jsonl")
  const big = "x".repeat(20000)
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      appendDecision(file, record({ sessionID: `ses_${i}`, stateText: big }), { captureState: true }),
    ),
  )
  const out = await lines(file)
  assert.equal(out.length, 50)
  const ids = new Set(out.map((l) => JSON.parse(l).sessionID))
  assert.equal(ids.size, 50)
})

test("state text is left out unless capture is enabled", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "log-"))
  await appendDecision(path.join(dir, "off.jsonl"), record(), { captureState: false })
  await appendDecision(path.join(dir, "on.jsonl"), record(), { captureState: true })
  const off = (await lines(path.join(dir, "off.jsonl")))[0]
  const on = JSON.parse((await lines(path.join(dir, "on.jsonl")))[0])
  assert.doesNotMatch(off, /secret prompt/)
  assert.equal(JSON.parse(off).state.chars, 2841)
  assert.equal(on.stateText, '{"latest_message":"secret prompt"}')
})

test("fallback records keep both proposed and applied tiers", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "log-")), "d.jsonl")
  await appendDecision(
    file,
    record({ proposedTier: "small", appliedTier: "medium", confidence: 0.2, reason: "low-confidence-fallback" }),
    { captureState: false },
  )
  const r = JSON.parse((await lines(file))[0])
  assert.equal(r.reason, "low-confidence-fallback")
  assert.equal(r.proposedTier, "small")
  assert.equal(r.appliedTier, "medium")
})
