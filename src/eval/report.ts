// Writes an evaluation run to results/<date>-<shortsha>/: report.md, report.json and decisions.jsonl,
// with enough metadata to compare a rerun on another machine.
import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { Config } from "../core/config.ts"
import type { EvaluationResult, RouterSummary } from "./evaluate.ts"
import type { Agreement } from "./stats.ts"

export interface RunMetadata {
  date: string
  commit: string
  /** Last commit touching data/eval, with "+dirty" if it has uncommitted changes. */
  datasetRevision: string
  dataset: { prompts: number; sessions: number; turns: number }
  config: Config
  versions: {
    node: string
    opencode?: string
    ollama?: string
    /** Ollama model name -> digest, for every tier and router model. */
    models: Record<string, string>
    /** What the System One server reports about itself. */
    systemOne?: unknown
  }
}

const sh = (cmd: string, args: string[], cwd: string) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return undefined
  }
}

async function getJSON(url: string): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    return r.ok ? await r.json() : undefined
  } catch {
    return undefined
  }
}

/** Rewrites absolute paths in the configuration as repository-relative or home-relative, so results can be published. */
export function portablePaths<T>(value: T, root: string, home = homedir()): T {
  const fix = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v === root) return "."
      if (v.startsWith(root + path.sep)) return path.relative(root, v)
      if (v.startsWith(home + path.sep)) return "~" + v.slice(home.length)
      return v
    }
    if (Array.isArray(v)) return v.map(fix)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]))
    return v
  }
  return fix(value) as T
}

/** Collects versions from git, OpenCode, Ollama and the System One server. Missing pieces are left out. */
export async function collectMetadata(config: Config, root: string, dataset: RunMetadata["dataset"]): Promise<RunMetadata> {
  const commit = sh("git", ["rev-parse", "--short", "HEAD"], root) ?? "unknown"
  const dataCommit = sh("git", ["log", "-1", "--format=%h", "--", "data/eval"], root) || "uncommitted"
  const dirty = sh("git", ["status", "--porcelain", "--", "data/eval"], root)
  const tags = await getJSON(config.llm.baseURL.replace(/\/+$/, "") + "/api/tags")
  const wanted = new Set([
    ...config.tiers.map((t) => t.model.slice(t.model.indexOf("/") + 1)),
    config.llm.model,
    config.embedding.model,
  ])
  const models: Record<string, string> = {}
  for (const m of tags?.models ?? []) {
    const short = String(m.name).replace(/:latest$/, "")
    if (wanted.has(m.name) || wanted.has(short)) models[m.name] = String(m.digest).slice(0, 12)
  }
  const ollama = (await getJSON(config.llm.baseURL.replace(/\/+$/, "") + "/api/version"))?.version
  const systemOne = (await getJSON(config.systemOne.baseURL.replace(/\/+$/, "") + "/v1/models"))?.models?.find(
    (m: any) => m.name === config.systemOne.model,
  )
  const opencode = sh("opencode", ["--version"], root)
  return {
    date: new Date().toISOString(),
    commit,
    datasetRevision: dataCommit + (dirty ? "+dirty" : ""),
    dataset,
    config: portablePaths(config, root),
    versions: {
      node: process.versions.node,
      ...(opencode ? { opencode } : {}),
      ...(ollama ? { ollama } : {}),
      models,
      ...(systemOne ? { systemOne } : {}),
    },
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const ag = (a: Agreement) => (a.n ? `${a.agree}/${a.n} (${pct(a.rate)}, 95% CI ${pct(a.ci.low)}–${pct(a.ci.high)})` : "–")

function routerSection(s: RouterSummary, tiers: string[]): string {
  const cols = [...tiers, "error"]
  const matrix = [
    `| label \\ chosen | ${cols.join(" | ")} |`,
    `|---|${cols.map(() => "---").join("|")}|`,
    ...tiers.map((l) => `| ${l} | ${cols.map((c) => s.confusion[l][c]).join(" | ")} |`),
  ]
  const sweep = [
    "| threshold | agreement | fallback rate |",
    "|---|---|---|",
    ...s.thresholdSweep.map((r) => `| ${r.threshold.toFixed(1)} | ${ag(r.agreement)} | ${pct(r.fallbackRate)} |`),
  ]
  const sessions = s.sessions.length
    ? [
        "| session | turns | with hysteresis | switches | without hysteresis | switches |",
        "|---|---|---|---|---|---|",
        ...s.sessions.map(
          (x) =>
            `| ${x.session} | ${x.turns} | ${ag(x.withHysteresis.agreement)} | ${x.withHysteresis.switches} | ${ag(x.withoutHysteresis.agreement)} | ${x.withoutHysteresis.switches} |`,
        ),
      ]
    : ["No multi-turn sessions in this run."]
  return [
    `### ${s.router} (${s.model}${s.modelVersion && s.modelVersion !== s.model ? `, reported ${s.modelVersion}` : ""})`,
    "",
    `- Proposed tier vs label, all cases: ${ag(s.overall)}`,
    `- Single prompts: ${ag(s.prompts)}; multi-turn turns: ${ag(s.turns)}`,
    `- Applied tier (threshold and hysteresis as configured) vs label: ${ag(s.applied)}`,
    `- Routing latency: median ${Math.round(s.latency.median)} ms, p95 ${Math.round(s.latency.p95)} ms`,
    `- Routing tokens: ${s.tokens.input} in, ${s.tokens.output} out; estimated cost $${s.costUSD.toFixed(6)}; errors ${s.errors}`,
    "",
    "Confusion (rows are your labels, columns the router's proposal):",
    "",
    ...matrix,
    "",
    "Confidence-threshold sweep (fallback to the default tier only, no hysteresis):",
    "",
    ...sweep,
    "",
    "Sessions, applied tiers as live routing would apply them:",
    "",
    ...sessions,
  ].join("\n")
}

export function renderMarkdown(result: EvaluationResult, meta: RunMetadata): string {
  const tiers = meta.config.tiers.map((t) => t.id)
  const summary = [
    "| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |",
    "|---|---|---|---|---|---|---|",
    ...result.summaries.map(
      (s) =>
        `| ${s.router} | ${ag(s.overall)} | ${ag(s.prompts)} | ${ag(s.turns)} | ${ag(s.applied)} | ${Math.round(s.latency.median)} ms | ${Math.round(s.latency.p95)} ms |`,
    ),
  ]
  const stateSize = result.stateSize
    ? [
        `## State-size sweep (${result.stateSize.router}, multi-turn turns)`,
        "",
        "| budget (tokens) | agreement | median latency | median state tokens | turns truncated |",
        "|---|---|---|---|---|",
        ...result.stateSize.rows.map(
          (r) =>
            `| ${r.budgetTokens} | ${ag(r.agreement)} | ${Math.round(r.medianLatencyMs)} ms | ${Math.round(r.medianStateTokens)} | ${r.truncatedTurns} |`,
        ),
        "",
      ]
    : []
  const v = meta.versions
  return [
    "# Routing evaluation",
    "",
    `Run ${meta.date} at commit \`${meta.commit}\`, dataset revision \`${meta.datasetRevision}\`: ${meta.dataset.prompts} prompts, ${meta.dataset.sessions} sessions (${meta.dataset.turns} turns).`,
    `Threshold ${meta.config.policy.threshold}, margin ${meta.config.policy.margin}, state budget ${meta.config.state.budgetTokens} tokens, default tier ${meta.config.defaultTier}.`,
    "",
    "Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.",
    "",
    "## Summary",
    "",
    ...summary,
    "",
    ...stateSize,
    "## Routers",
    "",
    ...result.summaries.map((s) => routerSection(s, tiers) + "\n"),
    "## Versions",
    "",
    `- Node ${v.node}${v.opencode ? `, OpenCode ${v.opencode}` : ""}${v.ollama ? `, Ollama ${v.ollama}` : ""}`,
    ...Object.entries(v.models).map(([m, d]) => `- ${m}: \`${d}\``),
    ...(v.systemOne ? [`- System One server: \`${JSON.stringify(v.systemOne).slice(0, 300)}\``] : []),
    "",
  ].join("\n")
}

/** Writes the three result files; returns the run directory. */
export async function writeRun(resultsDir: string, result: EvaluationResult, meta: RunMetadata): Promise<string> {
  const dir = path.join(resultsDir, `${meta.date.slice(0, 10)}-${meta.commit}`)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "report.md"), renderMarkdown(result, meta))
  const { decisions, ...rest } = result
  await writeFile(path.join(dir, "report.json"), JSON.stringify({ meta, ...rest }, null, 2) + "\n")
  await writeFile(path.join(dir, "decisions.jsonl"), decisions.map((d) => JSON.stringify(d)).join("\n") + "\n")
  return dir
}
