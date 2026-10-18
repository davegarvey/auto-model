// Guards the embedding baseline's fairness: no evaluation prompt may also be one of its labelled examples.
// Exact matches after normalisation and near-duplicates (high word overlap) both count.

export interface Example {
  id: string
  label: string
  text: string
}

export interface Overlap {
  exampleID: string
  evalText: string
  similarity: number
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

const words = (text: string) => new Set(normalise(text).split(" ").filter(Boolean))

/** Jaccard similarity of the two texts' word sets. */
export function similarity(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  if (x.size === 0 && y.size === 0) return 1
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared / (x.size + y.size - shared)
}

export function findOverlaps(examples: Example[], evalTexts: string[], threshold = 0.8): Overlap[] {
  const out: Overlap[] = []
  for (const example of examples)
    for (const evalText of evalTexts) {
      const s = normalise(example.text) === normalise(evalText) ? 1 : similarity(example.text, evalText)
      if (s >= threshold) out.push({ exampleID: example.id, evalText, similarity: Number(s.toFixed(3)) })
    }
  return out
}

export function parseExamples(jsonl: string, tiers: string[]): Example[] {
  return jsonl
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      const e = JSON.parse(line)
      if (typeof e.id !== "string" || typeof e.text !== "string" || !tiers.includes(e.label))
        throw new Error(`router example on line ${i + 1} needs an id, text and a label from ${tiers.join(", ")}`)
      return { id: e.id, label: e.label, text: e.text }
    })
}
