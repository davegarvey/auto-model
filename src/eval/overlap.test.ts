import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { findOverlaps, parseExamples, similarity } from "./overlap.ts"

const examples = [
  { id: "s01", label: "small", text: "What does the --dry-run flag do in scripts/release.sh?" },
  { id: "l01", label: "large", text: "Memory grows steadily over a week until the worker is killed. Find the leak." },
]

test("exact matches after normalisation are overlaps", () => {
  const found = findOverlaps(examples, ["what does the dry run flag do in scripts release sh"])
  assert.equal(found.length, 1)
  assert.equal(found[0].exampleID, "s01")
  assert.equal(found[0].similarity, 1)
})

test("near-duplicates are overlaps; related but different prompts are not", () => {
  assert.equal(
    findOverlaps(examples, ["Memory grows steadily over a week until the worker gets killed. Find the leak."]).length,
    1,
  )
  assert.equal(findOverlaps(examples, ["Why does the worker use so much memory on startup?"]).length, 0)
  assert.ok(similarity("a b c", "x y z") === 0)
})

test("the shipped router examples parse, with ten per tier", () => {
  const file = path.resolve(import.meta.dirname, "../../data/router-examples.jsonl")
  const parsed = parseExamples(readFileSync(file, "utf8"), ["small", "medium", "large"])
  for (const tier of ["small", "medium", "large"])
    assert.equal(parsed.filter((e) => e.label === tier).length, 10, tier)
  assert.equal(new Set(parsed.map((e) => e.id)).size, parsed.length)
  assert.equal(findOverlaps(parsed, parsed.map((e) => e.text)).length, parsed.length, "each matches only itself")
})

test("unknown labels are rejected", () => {
  assert.throws(() => parseExamples('{"id":"x","label":"huge","text":"t"}', ["small", "large"]), /label/)
})
