// Runs the full routing evaluation and writes the results directory.
// Usage: node src/eval/run.ts [--routers systemone,embedding,llm] [--data data/eval] [--out results]
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { loadConfig, type RouterName } from "../core/config.ts"
import { createRouter } from "../core/route.ts"
import { loadDataset } from "./dataset.ts"
import { evaluate } from "./evaluate.ts"
import { parseExamples } from "./overlap.ts"
import { collectMetadata, writeRun } from "./report.ts"

const root = path.resolve(import.meta.dirname, "../..")
const { values } = parseArgs({
  options: {
    routers: { type: "string", default: "systemone,embedding,llm" },
    data: { type: "string", default: path.join(root, "data/eval") },
    out: { type: "string", default: path.join(root, "results") },
    config: { type: "string", default: path.join(root, "auto-model.config.json") },
    budgets: { type: "string" },
  },
})

const config = loadConfig(values.config!)
const tiers = config.tiers.map((t) => t.id)
const dataset = loadDataset(values.data!, tiers)
if (dataset.prompts.length === 0 && dataset.sessions.length === 0) {
  console.error(`no evaluation data in ${values.data}; see data/eval/README.md`)
  process.exit(1)
}
const routers = await Promise.all(values.routers!.split(",").map((n) => createRouter(config, n.trim() as RouterName)))
const started = Date.now()
const result = await evaluate({
  config,
  routers,
  dataset,
  routerExamples: parseExamples(readFileSync(config.embedding.examples, "utf8"), tiers),
  ...(values.budgets ? { stateBudgets: values.budgets.split(",").map(Number) } : {}),
  onProgress: (m) => process.stderr.write(`\r\x1b[K${m}`),
})
process.stderr.write("\n")
const meta = await collectMetadata(config, root, {
  prompts: dataset.prompts.length,
  sessions: dataset.sessions.length,
  turns: dataset.sessions.reduce((n, s) => n + s.turns.length, 0),
})
const dir = await writeRun(values.out!, result, meta)
console.log(`wrote ${path.relative(root, dir)} in ${Math.round((Date.now() - started) / 1000)} s`)
for (const s of result.summaries)
  console.log(`${s.router}: ${s.overall.agree}/${s.overall.n} proposed, ${s.applied.agree}/${s.applied.n} applied, median ${Math.round(s.latency.median)} ms`)
