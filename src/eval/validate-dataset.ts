// Validates data/eval and checks it does not overlap the embedding router's examples.
// Usage: node src/eval/validate-dataset.ts [--dir data/eval]
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { loadConfig } from "../core/config.ts"
import { datasetTexts, loadDataset } from "./dataset.ts"
import { findOverlaps, parseExamples } from "./overlap.ts"

const root = path.resolve(import.meta.dirname, "../..")
const { values } = parseArgs({ options: { dir: { type: "string", default: path.join(root, "data/eval") } } })

const config = loadConfig(path.join(root, "auto-model.config.json"))
const tiers = config.tiers.map((t) => t.id)
try {
  const dataset = loadDataset(values.dir!, tiers)
  const examples = parseExamples(readFileSync(config.embedding.examples, "utf8"), tiers)
  const overlaps = findOverlaps(examples, datasetTexts(dataset))

  const count = (labels: string[]) => tiers.map((t) => `${t} ${labels.filter((l) => l === t).length}`).join(", ")
  console.log(`prompts: ${dataset.prompts.length} (${count(dataset.prompts.map((p) => p.label))})`)
  for (const s of dataset.sessions)
    console.log(`session ${s.id}: ${s.turns.length} turns (${count(s.turns.map((t) => t.label))})`)
  if (overlaps.length) {
    for (const o of overlaps) console.error(`overlap: router example ${o.exampleID} ~ "${o.evalText}" (${o.similarity})`)
    process.exit(1)
  }
  console.log("ok: valid, and no overlap with router examples")
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
