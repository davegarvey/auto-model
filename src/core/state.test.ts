import assert from "node:assert/strict"
import { test } from "node:test"
import { buildState, estimateTokens, type Message } from "./state.ts"

const conversation: Message[] = [
  { from: "user", text: "The checkout test fails intermittently with a timeout in payment.spec.ts." },
  { from: "assistant", text: "I traced it to a race between the mock server start and the first request." },
]

test("multi-turn context is included alongside a short follow-up", () => {
  const state = buildState(
    { history: conversation, latestMessage: "now fix it", currentTier: "large" },
    { budgetTokens: 8192 },
  )
  assert.equal(state.value.latest_message, "now fix it")
  assert.deepEqual(state.value.earlier_turns, conversation)
  assert.equal(state.value.current_tier, "large")
  assert.equal(state.truncated, false)
  assert.match(state.text, /payment\.spec\.ts/)
})

test("field order puts carried-over content first and the latest message last", () => {
  const state = buildState({ history: conversation, latestMessage: "go" }, { budgetTokens: 8192 })
  assert.deepEqual(Object.keys(state.value), ["earlier_turns", "recent_tools", "current_tier", "latest_message"])
})

test("long sessions are trimmed oldest first and the latest message stays whole", () => {
  const history: Message[] = Array.from({ length: 40 }, (_, i) => ({
    from: i % 2 ? "assistant" : "user",
    text: `message ${i} ` + "x".repeat(700),
  }))
  const latest = "Please summarise where we are."
  const state = buildState({ history, latestMessage: latest }, { budgetTokens: 2048 })
  assert.ok(state.estimatedTokens <= 2048)
  assert.equal(state.value.latest_message, latest)
  assert.ok(state.droppedMessages > 0)
  assert.equal(state.truncated, true)
  // The newest earlier message survives; the oldest is gone.
  assert.match(state.value.earlier_turns.at(-1)!.text, /^message 39 /)
  assert.doesNotMatch(state.text, /message 0 /)
})

test("an oversized latest message is clipped to fit and the truncation is recorded", () => {
  const latest = "start " + "y".repeat(20000) + " end"
  const state = buildState({ history: conversation, latestMessage: latest }, { budgetTokens: 1024 })
  assert.ok(state.estimatedTokens <= 1024, `estimated ${state.estimatedTokens}`)
  assert.equal(state.truncated, true)
  assert.ok(state.value.latest_message.startsWith("start "))
  assert.ok(state.value.latest_message.endsWith(" end"))
})

test("one long earlier reply is capped so it cannot crowd out the rest", () => {
  const history: Message[] = [
    { from: "user", text: "first question" },
    { from: "assistant", text: "z".repeat(50000) },
  ]
  const state = buildState({ history, latestMessage: "next" }, { budgetTokens: 8192, maxMessageTokens: 256 })
  assert.equal(state.value.earlier_turns.length, 2)
  assert.ok(estimateTokens(state.value.earlier_turns[1].text) <= 256)
  assert.equal(state.truncated, true)
})

test("consecutive turns without trimming share a prefix", () => {
  const first = buildState({ history: conversation, latestMessage: "now fix it" }, { budgetTokens: 8192 })
  const second = buildState(
    {
      history: [...conversation, { from: "user", text: "now fix it" }, { from: "assistant", text: "Fixed." }],
      latestMessage: "run the tests",
    },
    { budgetTokens: 8192 },
  )
  const carried = JSON.stringify(conversation).slice(0, -1) // the earlier messages, without the closing bracket
  assert.ok(first.text.startsWith(`{"earlier_turns":${carried}`))
  assert.ok(second.text.startsWith(`{"earlier_turns":${carried}`))
})

test("recent tools are listed with failures marked", () => {
  const state = buildState(
    { history: [], latestMessage: "x", recentTools: [{ name: "bash", ok: false }, { name: "read", ok: true }] },
    { budgetTokens: 8192 },
  )
  assert.deepEqual(state.value.recent_tools, ["bash (failed)", "read"])
})
