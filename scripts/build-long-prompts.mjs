// Builds data/eval-long/prompts.jsonl from this repository's own files plus one generated service log.
// Usage: node scripts/build-long-prompts.mjs "$PWD". Rebuilding after the source files change alters the prompts.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const root = process.argv[2]
const read = (f) => readFileSync(path.join(root, f), "utf8")
const block = (name, text) => `${name}:\n\n\`\`\`\n${text.trimEnd()}\n\`\`\``

// A realistic API service log: steady traffic, a few warnings, the first error at 09:41:17.
function serviceLog() {
  const lines = []
  let t = Date.parse("2026-10-14T09:38:02.118Z")
  const paths = ["/orders", "/orders/48213", "/customers/7731", "/invoices?page=2", "/orders/48217/lines", "/health"]
  let n = 0
  const at = () => new Date(t).toISOString()
  const step = () => (t += 700 + ((n * 7919) % 2300))
  const req = () => {
    const p = paths[n % paths.length]
    const ms = 18 + ((n * 37) % 140)
    lines.push(`${at()} INFO  orders-api  req=${(0x5a3f00 + n).toString(16)} GET ${p} 200 ${ms}ms`)
  }
  for (; n < 70; n++) {
    step()
    req()
    if (n === 22) lines.push(`${at()} WARN  orders-api  pool: 18/20 connections in use`)
    if (n === 41) lines.push(`${at()} WARN  orders-api  slow query: SELECT * FROM order_lines WHERE order_id = $1 (1840ms)`)
  }
  t = Date.parse("2026-10-14T09:41:17.402Z")
  lines.push(`${at()} ERROR orders-api  req=5a3f47 GET /orders/48217/lines 500 30012ms`)
  lines.push(`${at()} ERROR orders-api  TimeoutError: acquiring a connection from the pool took longer than 30000ms`)
  lines.push(`    at Pool.acquire (node_modules/pg-pool/index.js:212:15)`)
  lines.push(`    at OrderLinesRepository.forOrder (src/orders/lines.repository.ts:41:22)`)
  lines.push(`    at OrdersController.lines (src/orders/orders.controller.ts:88:30)`)
  for (; n < 110; n++) {
    step()
    req()
    if (n === 80) lines.push(`${at()} ERROR orders-api  req=${(0x5a3f00 + n).toString(16)} GET /orders/48213 500 30004ms`)
    if (n === 95) lines.push(`${at()} WARN  orders-api  pool: 20/20 connections in use, 6 waiting`)
  }
  return lines.join("\n")
}

const design = read("openspec/changes/archive/2026-10-18-add-local-model-selector/design.md")
const designCut = design.slice(0, design.lastIndexOf("\n### ", 12500)) // whole sections, about 3,500 tokens

const prompts = [
  { id: "lp1", label: "small", position: "end",
    text: `${block("Here is the log from the orders API this morning", serviceLog())}\n\nWhat time was the first error in this log?` },
  { id: "lp2", label: "small", position: "start",
    text: `What licence is this? One word is fine.\n\n${block("LICENSE", read("LICENSE"))}` },
  { id: "lp3", label: "small", position: "start",
    text: `Which function in this file checks that a number is within its allowed range? Just the name.\n\n${block("src/core/config.ts", read("src/core/config.ts"))}` },
  { id: "lp4", label: "medium", position: "end",
    text: `${block("src/core/state.ts", read("src/core/state.ts"))}\n\n${block("src/core/state.test.ts", read("src/core/state.test.ts"))}\n\nAdd an option to cap how many earlier turns are kept in the state, separate from the token budget, and add a unit test for it.` },
  { id: "lp5", label: "medium", position: "start",
    text: `Add a fallback-rate column to the summary table that renderMarkdown produces, and update the report test to check it.\n\n${block("src/eval/report.ts", read("src/eval/report.ts"))}` },
  { id: "lp6", label: "medium", position: "end",
    text: `${block("README.md", read("README.md"))}\n\nAdd a section to this README on running the evaluation with your own labelled prompts, in the same style as the existing sections.` },
  { id: "lp7", label: "large", position: "end",
    text: `${block("design.md", designCut)}\n\nFind the flaw in this design.` },
  { id: "lp8", label: "large", position: "start",
    text: `Two OpenCode processes can write to the same decision log at once. Work out whether records can be lost or interleaved, and if they can, propose a fix that holds under concurrency.\n\n${block("src/core/log.ts", read("src/core/log.ts"))}\n\n${block("src/plugin/selector.ts", read("src/plugin/selector.ts"))}` },
]

mkdirSync(path.join(root, "data/eval-long/sessions"), { recursive: true })
writeFileSync(
  path.join(root, "data/eval-long/prompts.jsonl"),
  prompts.map(({ id, label, text, position }) => JSON.stringify({ id, label, text, note: `long prompt, request at the ${position}` })).join("\n") + "\n",
)
for (const p of prompts) console.log(p.id, p.label, p.text.length, "chars ~", Math.round(p.text.length / 3.5), "est. tokens")
