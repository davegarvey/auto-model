// Routes a single prompt through the routing core and prints the decision.
// Usage: node src/eval/route-once.ts [--router systemone|embedding|llm] [--current <tier>] [--config <file>] "<prompt>"
import path from "node:path"
import { parseArgs } from "node:util"
import { loadConfig, type RouterName } from "../core/config.ts"
import { createRouter, routeTurn } from "../core/route.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    router: { type: "string" },
    current: { type: "string" },
    config: { type: "string", default: path.resolve(import.meta.dirname, "../../auto-model.config.json") },
    json: { type: "boolean", default: false },
  },
})

const prompt = positionals.join(" ").trim()
if (!prompt) {
  console.error('usage: node src/eval/route-once.ts [--router <name>] [--current <tier>] "<prompt>"')
  process.exit(2)
}

const config = loadConfig(values.config!)
const router = await createRouter(config, values.router as RouterName | undefined)
const { record } = await routeTurn({
  config,
  router,
  sessionID: "route-once",
  state: { history: [], latestMessage: prompt, ...(values.current ? { currentTier: values.current } : {}) },
})

if (values.json) {
  const { stateText: _, ...rest } = record
  console.log(JSON.stringify(rest, null, 2))
} else {
  const p = record.probabilities
    ? " " + Object.entries(record.probabilities).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ")
    : ""
  console.log(
    `${record.router}: proposed ${record.proposedTier ?? "-"} (confidence ${record.confidence?.toFixed(2) ?? "-"}${p})` +
      ` -> applied ${record.appliedTier} [${record.reason}] ${record.targetModel} in ${record.latencyMs} ms` +
      (record.error ? `\n  error: ${record.error}` : ""),
  )
}
