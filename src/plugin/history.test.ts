import assert from "node:assert/strict"
import { test } from "node:test"
import { historyFromMessages, type SessionMessage } from "./history.ts"

const messages: SessionMessage[] = [
  { type: "model-switched" },
  { type: "user", text: "Why does checkout time out?" },
  {
    type: "assistant",
    content: [
      { type: "reasoning", text: "thinking about it" },
      { type: "tool", name: "read", state: { status: "completed" } },
    ],
  },
  {
    type: "assistant",
    content: [
      { type: "text", text: "The mock server starts late." },
      { type: "tool", name: "bash", state: { status: "error" } },
    ],
  },
  { type: "user", text: "now fix it" },
]

test("user and assistant text become ordered history, steps of one turn merged", () => {
  const { history } = historyFromMessages(messages.slice(0, 4))
  assert.deepEqual(history, [
    { from: "user", text: "Why does checkout time out?" },
    { from: "assistant", text: "[used tools: read]\nThe mock server starts late." },
  ])
})

test("reasoning is excluded and tools since the last user message are recent", () => {
  const { history, recentTools } = historyFromMessages(messages.slice(0, 4))
  assert.doesNotMatch(JSON.stringify(history), /thinking about it/)
  assert.deepEqual(recentTools, [
    { name: "read", ok: true },
    { name: "bash", ok: false },
  ])
})

test("a new user message resets recent tools", () => {
  assert.deepEqual(historyFromMessages(messages).recentTools, [])
})

test("the prompt being routed is not duplicated into the history", () => {
  const { history } = historyFromMessages(messages, "now fix it")
  assert.equal(history.length, 2)
  assert.equal(history.at(-1)!.from, "assistant")
  assert.equal(historyFromMessages(messages, "something else").history.length, 3)
})
