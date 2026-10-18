import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { DatasetError, datasetTexts, loadDataset, parsePrompts, parseSession, turnStateInput } from "./dataset.ts"

const tiers = ["small", "medium", "large"]

const session = {
  id: "flaky-test",
  title: "Fixing a flaky test",
  source: "public repo example",
  turns: [
    { user: "The checkout test fails one run in ten. Why?", assistant: "A race with the mock server.", tools: [{ name: "read", ok: true }], label: "large" },
    { user: "now fix it", assistant: "Added a readiness wait.", tools: [{ name: "edit", ok: true }, { name: "bash", ok: false }], label: "medium" },
    { user: "rename the helper to waitForServer", assistant: "", label: "small" },
  ],
}

test("valid prompts parse, keeping optional notes", () => {
  const prompts = parsePrompts(
    ['{"id":"p1","text":"What port?","label":"small"}', "", '{"id":"p2","text":"Design X","label":"large","note":"design"}'].join("\n"),
    tiers,
  )
  assert.deepEqual(prompts.map((p) => p.label), ["small", "large"])
  assert.equal(prompts[1].note, "design")
})

test("an unknown label is rejected and the case is named", () => {
  assert.throws(
    () => parsePrompts('{"id":"p1","text":"x","label":"huge"}', tiers),
    (e: unknown) => e instanceof DatasetError && /p1/.test(e.message) && /huge/.test(e.message),
  )
  const bad = { ...session, turns: [{ ...session.turns[0], label: "xl" }] }
  assert.throws(() => parseSession(JSON.stringify(bad), tiers), /turn 1.*xl/)
})

test("malformed cases are rejected", () => {
  assert.throws(() => parsePrompts('{"id":"p1","label":"small"}', tiers), DatasetError)
  assert.throws(() => parsePrompts('{"id":"p1","text":"a","label":"small"}\n{"id":"p1","text":"b","label":"small"}', tiers), /duplicate/)
  assert.throws(() => parsePrompts("not json", tiers), /not valid JSON/)
  assert.throws(() => parseSession(JSON.stringify({ ...session, turns: [] }), tiers), /at least one turn/)
})

test("each session turn gets the state live routing would build", () => {
  const s = parseSession(JSON.stringify(session), tiers)
  const first = turnStateInput(s, 0)
  assert.deepEqual(first.history, [])
  assert.equal(first.latestMessage, session.turns[0].user)

  const second = turnStateInput(s, 1, "large")
  assert.deepEqual(second.history, [
    { from: "user", text: session.turns[0].user },
    { from: "assistant", text: "A race with the mock server." },
  ])
  assert.deepEqual(second.recentTools, [{ name: "read", ok: true }])
  assert.equal(second.currentTier, "large")
  assert.equal(second.latestMessage, "now fix it")

  // An empty assistant summary adds no history entry.
  assert.equal(turnStateInput(s, 2).history.length, 4)
  assert.equal(turnStateInput(s, 2).history.at(-1)!.text, "Added a readiness wait.")
})

test("a dataset directory loads prompts and sessions, and lists texts for the overlap check", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ds-"))
  await writeFile(path.join(dir, "prompts.jsonl"), '{"id":"p1","text":"What port?","label":"small"}\n')
  await mkdir(path.join(dir, "sessions"))
  await writeFile(path.join(dir, "sessions", "a.json"), JSON.stringify(session))
  const d = loadDataset(dir, tiers)
  assert.equal(d.prompts.length, 1)
  assert.equal(d.sessions[0].turns.length, 3)
  assert.equal(datasetTexts(d).length, 4)
  assert.deepEqual(loadDataset(path.join(dir, "missing"), tiers), { prompts: [], sessions: [] })
})
