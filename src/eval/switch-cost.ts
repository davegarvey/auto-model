// Switching cost benchmark: what moving between tiers costs in model load time and prompt reprocessing.
// Calls Ollama directly, bypassing OpenCode and the routers. Runs on its own:
//   node src/eval/switch-cost.ts [--sizes 2048,8192,32768] [--reps 3] [--designs mixed-family,same-family,single-model]
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { median } from "./stats.ts"

export type Think = boolean | "low" | "medium" | "high"

export interface Endpoint {
  model: string
  think: Think
}

export type TransitionKind = "baseline" | "thinking-toggled" | "effort-changed" | "other-model-loaded" | "other-model-unloaded"

export interface Transition {
  kind: TransitionKind
  from: Endpoint
  to: Endpoint
}

export interface Design {
  id: string
  description: string
  transitions: Transition[]
}

export interface ChatTiming {
  loadMs: number
  promptMs: number
  promptTokens: number
  wallMs: number
}

/** The two Ollama operations the benchmark needs; stubbed in tests. */
export interface OllamaClient {
  chat(endpoint: Endpoint, prompt: string, numCtx: number): Promise<ChatTiming>
  unload(model: string): Promise<void>
}

export interface Row {
  design: string
  transition: TransitionKind
  from: string
  to: string
  contextTokens: number
  promptTokens: number
  loadMs: number
  promptMs: number
  /** Time before the first output token: load plus prompt processing. */
  firstTokenMs: number
  /** Cold prompt processing for the target model at this size, for reference. */
  coldPromptMs: number
  /** promptMs / coldPromptMs: about 0 when the cache was reused, about 1 when the whole context was re-read. */
  reprocessedShare: number
  reps: number
}

const QWEN = "qwen3.6:35b-mlx"
export const DESIGNS: Design[] = [
  {
    id: "mixed-family",
    description: "The shipped tiers: gemma4:e2b (small) and qwen3.6:35b with thinking off (medium) or on (large)",
    transitions: [
      { kind: "baseline", from: { model: QWEN, think: false }, to: { model: QWEN, think: false } },
      { kind: "thinking-toggled", from: { model: QWEN, think: false }, to: { model: QWEN, think: true } },
      { kind: "other-model-loaded", from: { model: "gemma4:e2b-mlx", think: false }, to: { model: QWEN, think: false } },
      { kind: "other-model-unloaded", from: { model: "gemma4:e2b-mlx", think: false }, to: { model: QWEN, think: false } },
      { kind: "other-model-loaded", from: { model: QWEN, think: false }, to: { model: "gemma4:e2b-mlx", think: false } },
    ],
  },
  {
    id: "same-family",
    description: "Two Qwen models: qwen3.6:35b and qwen3.8:27b",
    transitions: [
      { kind: "baseline", from: { model: "qwen3.8:27b-nvfp4", think: false }, to: { model: "qwen3.8:27b-nvfp4", think: false } },
      { kind: "other-model-loaded", from: { model: QWEN, think: false }, to: { model: "qwen3.8:27b-nvfp4", think: false } },
      { kind: "other-model-unloaded", from: { model: QWEN, think: false }, to: { model: "qwen3.8:27b-nvfp4", think: false } },
    ],
  },
  {
    id: "single-model",
    description: "One model at different effort levels: gpt-oss:20b low and high",
    transitions: [
      { kind: "baseline", from: { model: "gpt-oss:20b", think: "low" }, to: { model: "gpt-oss:20b", think: "low" } },
      { kind: "effort-changed", from: { model: "gpt-oss:20b", think: "low" }, to: { model: "gpt-oss:20b", think: "high" } },
    ],
  },
]

const label = (e: Endpoint) => `${e.model}${e.think === false ? "" : `#${e.think === true ? "thinking" : e.think}`}`

/** A context of about `tokens` tokens, starting with a nonce so no model has it cached. */
export function makeContext(text: string, tokens: number, nonce: string): string {
  const chars = Math.floor(tokens * 3.5)
  let body = text
  while (body.length < chars) body += "\n\n" + text
  return `Session ${nonce}. The conversation so far:\n\n${body.slice(0, chars)}\n\nReply with the single word: ok`
}

export interface BenchmarkInput {
  client: OllamaClient
  text: string
  sizes: number[]
  reps: number
  designs: Design[]
  numCtx?: number
  onProgress?: (message: string) => void
}

export async function runBenchmark(input: BenchmarkInput): Promise<Row[]> {
  const { client } = input
  const numCtx = input.numCtx ?? Math.max(...input.sizes) + 8192
  const progress = input.onProgress ?? (() => {})
  let n = 0
  const nonce = () => `${Date.now().toString(36)}-${(n++).toString(36)}`
  const rows: Row[] = []

  for (const design of input.designs) {
    const models = [...new Set(design.transitions.flatMap((t) => [t.from.model, t.to.model]))]
    for (const m of models) await client.unload(m)

    for (const size of input.sizes) {
      // Cold reference: the model is loaded, the context is new to it.
      const cold: Record<string, number> = {}
      for (const t of design.transitions) {
        const key = label(t.to)
        if (key in cold) continue
        const samples: number[] = []
        for (let r = 0; r < input.reps; r++) {
          await client.chat(t.to, "Reply with the single word: ok", numCtx)
          samples.push((await client.chat(t.to, makeContext(input.text, size, nonce()), numCtx)).promptMs)
        }
        cold[key] = median(samples)
      }

      for (const t of design.transitions) {
        progress(`${design.id}: ${t.kind} ${label(t.from)} -> ${label(t.to)} at ${size} tokens`)
        const samples: ChatTiming[] = []
        for (let r = 0; r < input.reps; r++) {
          const context = makeContext(input.text, size, nonce())
          if (t.kind === "other-model-loaded") await client.chat(t.to, "Reply with the single word: ok", numCtx)
          await client.chat(t.from, context, numCtx)
          if (t.kind === "other-model-unloaded") await client.unload(t.to.model)
          samples.push(await client.chat(t.to, context, numCtx))
        }
        const promptMs = median(samples.map((s) => s.promptMs))
        const loadMs = median(samples.map((s) => s.loadMs))
        const coldPromptMs = cold[label(t.to)]
        rows.push({
          design: design.id,
          transition: t.kind,
          from: label(t.from),
          to: label(t.to),
          contextTokens: size,
          promptTokens: median(samples.map((s) => s.promptTokens)),
          loadMs,
          promptMs,
          firstTokenMs: median(samples.map((s) => s.loadMs + s.promptMs)),
          coldPromptMs,
          reprocessedShare: coldPromptMs > 0 ? Math.min(1.5, promptMs / coldPromptMs) : 0,
          reps: samples.length,
        })
      }
    }
    for (const m of models) await client.unload(m)
  }
  return rows
}

export function ollamaClient(baseURL = "http://localhost:11434"): OllamaClient {
  const base = baseURL.replace(/\/+$/, "")
  const post = async (pathname: string, body: unknown) => {
    const response = await fetch(base + pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    })
    if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${(await response.text()).slice(0, 200)}`)
    return response.json() as Promise<any>
  }
  return {
    async chat(endpoint, prompt, numCtx) {
      const started = performance.now()
      const r = await post("/api/chat", {
        model: endpoint.model,
        stream: false,
        think: endpoint.think,
        keep_alive: "30m",
        options: { num_ctx: numCtx, num_predict: 1, temperature: 0 },
        messages: [{ role: "user", content: prompt }],
      })
      return {
        loadMs: (r.load_duration ?? 0) / 1e6,
        promptMs: (r.prompt_eval_duration ?? 0) / 1e6,
        promptTokens: r.prompt_eval_count ?? 0,
        wallMs: performance.now() - started,
      }
    },
    async unload(model) {
      await post("/api/generate", { model, keep_alive: 0 }).catch(() => {})
    },
  }
}

export function renderSwitchCost(rows: Row[], meta: { date: string; reps: number; source: string }): string {
  const lines = [
    "# Switching cost benchmark",
    "",
    `Run ${meta.date}. Median of ${meta.reps} repetitions. Context text: ${meta.source}.`,
    "",
    "\"Reprocessed\" is prompt-processing time as a share of a cold read of the same context by the same model: about 0% means the cache was reused, about 100% means the whole context was read again.",
    "",
  ]
  for (const design of [...new Set(rows.map((r) => r.design))]) {
    lines.push(`## ${design}`, "", DESIGNS.find((d) => d.id === design)?.description ?? "", "")
    lines.push("| transition | from | to | context | load | prompt | first token | reprocessed |", "|---|---|---|---|---|---|---|---|")
    for (const r of rows.filter((x) => x.design === design))
      lines.push(
        `| ${r.transition} | ${r.from} | ${r.to} | ${r.contextTokens} | ${Math.round(r.loadMs)} ms | ${Math.round(r.promptMs)} ms | ${Math.round(r.firstTokenMs)} ms | ${Math.round(r.reprocessedShare * 100)}% |`,
      )
    lines.push("")
  }
  return lines.join("\n")
}

/** Text for the context: the recorded sessions when there is enough, otherwise the repository's documents. */
export function contextText(root: string, minChars: number): { text: string; source: string } {
  const sessionsDir = path.join(root, "data/eval/sessions")
  if (existsSync(sessionsDir)) {
    const text = readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(sessionsDir, f), "utf8")))
      .flatMap((s) => s.turns.map((t: any) => `user: ${t.user}\nassistant: ${t.assistant}`))
      .join("\n\n")
    if (text.length >= minChars) return { text, source: "recorded evaluation sessions" }
  }
  const docs = [
    "openspec/changes/add-local-model-selector/design.md",
    "openspec/changes/add-local-model-selector/proposal.md",
    "notes/LEARNINGS.md",
    "README.md",
    "src/core/state.ts",
    "src/plugin/selector.ts",
  ]
  const text = docs.filter((d) => existsSync(path.join(root, d))).map((d) => readFileSync(path.join(root, d), "utf8")).join("\n\n")
  return { text, source: "repository documents and source (recorded sessions too short or absent)" }
}

if (import.meta.main) {
  const { parseArgs } = await import("node:util")
  const root = path.resolve(import.meta.dirname, "../..")
  const { values } = parseArgs({
    options: {
      sizes: { type: "string", default: "2048,8192,32768" },
      reps: { type: "string", default: "3" },
      designs: { type: "string", default: DESIGNS.map((d) => d.id).join(",") },
      out: { type: "string" },
      ollama: { type: "string", default: "http://localhost:11434" },
    },
  })
  const sizes = values.sizes!.split(",").map(Number)
  const designs = values.designs!.split(",").map((id) => {
    const d = DESIGNS.find((x) => x.id === id.trim())
    if (!d) throw new Error(`unknown design ${id}; choose from ${DESIGNS.map((x) => x.id).join(", ")}`)
    return d
  })
  const { text, source } = contextText(root, Math.max(...sizes) * 3.5)
  const reps = Number(values.reps)
  const rows = await runBenchmark({
    client: ollamaClient(values.ollama),
    text,
    sizes,
    reps,
    designs,
    onProgress: (m) => process.stderr.write(`\r\x1b[K${m}`),
  })
  process.stderr.write("\n")
  const date = new Date().toISOString()
  const dir = values.out ?? path.join(root, "results", `${date.slice(0, 10)}-switch-cost`)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "switch-cost.json"), JSON.stringify({ date, reps, sizes, source, rows }, null, 2) + "\n")
  await writeFile(path.join(dir, "switch-cost.md"), renderSwitchCost(rows, { date, reps, source }))
  console.log(renderSwitchCost(rows, { date, reps, source }))
  console.log(`wrote ${path.relative(root, dir)}`)
}
