import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { parseConfig } from "../core/config.ts"
import type { Router } from "../core/router.ts"
import { evaluate } from "./evaluate.ts"
import { portablePaths, writeRun, type RunMetadata } from "./report.ts"

const config = parseConfig({
  tiers: [
    { id: "small", description: "s", model: "ollama/a", variant: "none" },
    { id: "large", description: "l", model: "ollama/b", variant: "high" },
  ],
  defaultTier: "large",
})
const router: Router = {
  name: "systemone",
  model: "kev-latest",
  async route(_m, state) {
    const tier = state.value.latest_message.includes("hard") ? "large" : "small"
    return { tier, confidence: 0.7, scores: { small: tier === "small" ? 0.8 : 0.2, large: tier === "large" ? 0.8 : 0.2 }, usage: { inputTokens: 50, outputTokens: 1 }, latencyMs: 5 }
  },
}
const dataset = {
  prompts: [{ id: "p1", text: "easy one", label: "small" }],
  sessions: [{ id: "s1", title: "t", turns: [{ user: "hard bug", assistant: "ok", label: "large" }, { user: "easy follow-up", assistant: "", label: "small" }] }],
}

const meta: RunMetadata = {
  date: "2026-10-18T12:00:00.000Z",
  commit: "abc1234",
  datasetRevision: "def5678",
  dataset: { prompts: 1, sessions: 1, turns: 2 },
  config,
  versions: { node: "24.21.0", opencode: "2.0.30", ollama: "0.32.14", models: { "a:latest": "e98b54fe1913" }, systemOne: { name: "kev-latest", run: "jaredpalmer/kev-4b@v1.0" } },
}

test("a run writes report.md, report.json and decisions.jsonl with its metadata", async () => {
  const result = await evaluate({ config, routers: [router], dataset, stateBudgets: [1024] })
  const dir = await writeRun(await mkdtemp(path.join(tmpdir(), "results-")), result, meta)
  assert.equal(path.basename(dir), "2026-10-18-abc1234")
  for (const f of ["report.md", "report.json", "decisions.jsonl"]) assert.ok(existsSync(path.join(dir, f)), f)

  const json = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8"))
  assert.equal(json.meta.commit, "abc1234")
  assert.equal(json.meta.datasetRevision, "def5678")
  assert.equal(json.meta.versions.systemOne.run, "jaredpalmer/kev-4b@v1.0")
  assert.equal(json.meta.config.policy.threshold, 0.4)
  assert.equal(json.summaries[0].overall.agree, 3)
  assert.equal(json.decisions, undefined, "decisions live in their own file")

  const lines = readFileSync(path.join(dir, "decisions.jsonl"), "utf8").trim().split("\n")
  assert.equal(lines.length, result.decisions.length)
  assert.ok(JSON.parse(lines[0]).stateText, "evaluation decisions keep the state")

  const md = readFileSync(path.join(dir, "report.md"), "utf8")
  for (const needle of ["abc1234", "def5678", "OpenCode 2.0.30", "e98b54fe1913", "State-size sweep", "threshold", "hysteresis", "95% CI"])
    assert.ok(md.includes(needle), needle)
})

test("paths in metadata are made repository- or home-relative", () => {
  const out = portablePaths(
    { a: "/home/u/repo/data/x.jsonl", b: "/home/u/.local/state/log.jsonl", c: "/etc/other", d: [{ e: "/home/u/repo" }], n: 3 },
    "/home/u/repo",
    "/home/u",
  )
  assert.deepEqual(out, { a: "data/x.jsonl", b: "~/.local/state/log.jsonl", c: "/etc/other", d: [{ e: "." }], n: 3 })
})
