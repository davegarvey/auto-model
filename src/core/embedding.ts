// Baseline: nearest-neighbour router over labelled example prompts, using a locally served embedding model.
import { readFileSync } from "node:fs"
import type { Tier } from "./config.ts"
import { chanceRescaled, isRecord, postJSON, RouterError, type Router } from "./router.ts"
import type { RoutingState } from "./state.ts"

export interface EmbeddingOptions {
  baseURL: string
  model: string
  /** JSONL file of {id, label, text}. */
  examples: string
  k: number
  timeoutMs: number
  /** The embedding model's context, in tokens; inputs that use all of it were probably cut short. */
  contextTokens?: number
  /** What to embed: the whole routing state (default), or only the latest message, like the examples. */
  input?: "state" | "latest"
}

interface Example {
  label: string
  vector: number[]
}

// EmbeddingGemma's recommended prefix for classification. Applied to examples and states alike.
const PREFIX = "task: classification | query: "

/**
 * The state's content, newest first. Embedding models truncate from the end (EmbeddingGemma reads 2,048 tokens),
 * so this order drops the oldest turns rather than the message being routed.
 */
export function embeddingText(state: RoutingState): string {
  const v = state.value
  const parts = [
    `latest message: ${v.latest_message}`,
    `current tier: ${v.current_tier}`,
    ...(v.recent_tools.length ? [`recent tools: ${v.recent_tools.join(", ")}`] : []),
    ...[...v.earlier_turns].reverse().map((m) => `${m.from}: ${m.text}`),
  ]
  return PREFIX + parts.join("\n")
}

/** Only the message being routed, with the same prefix as the examples, so like is compared with like. */
export const latestMessageText = (state: RoutingState) => PREFIX + state.value.latest_message

const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export function embeddingRouter(options: EmbeddingOptions): Router {
  const url = options.baseURL.replace(/\/+$/, "") + "/api/embed"
  const contextTokens = options.contextTokens ?? 2048
  let examples: Promise<Example[]> | undefined

  const embed = async (input: string[]) => {
    const body = await postJSON(url, { model: options.model, input, truncate: true }, options.timeoutMs)
    if (!isRecord(body) || !Array.isArray(body.embeddings) || body.embeddings.length !== input.length)
      throw new RouterError("invalid-response", "embedding response has no embeddings")
    return {
      vectors: body.embeddings as number[][],
      tokens: typeof body.prompt_eval_count === "number" ? body.prompt_eval_count : 0,
    }
  }

  const loadExamples = (menu: Tier[]) =>
    (examples ??= (async () => {
      const ids = menu.map((t) => t.id)
      const rows = readFileSync(options.examples, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as { label: string; text: string })
        .filter((r) => ids.includes(r.label))
      if (rows.length === 0) throw new RouterError("unavailable", `no router examples for these tiers in ${options.examples}`)
      const { vectors } = await embed(rows.map((r) => PREFIX + r.text))
      return rows.map((r, i) => ({ label: r.label, vector: vectors[i] }))
    })().catch((error) => {
      examples = undefined // retry on the next call
      throw error
    }))

  const text = options.input === "latest" ? latestMessageText : embeddingText
  return {
    name: options.input === "latest" ? "embedding-latest" : "embedding",
    model: options.model,
    async route(menu, state) {
      const labelled = await loadExamples(menu)
      const started = performance.now()
      const { vectors, tokens } = await embed([text(state)])
      const query = vectors[0]

      const nearest = labelled
        .map((e) => ({ label: e.label, sim: cosine(query, e.vector) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, options.k)
      const weights: Record<string, number> = Object.fromEntries(menu.map((t) => [t.id, 0]))
      for (const n of nearest) weights[n.label] += Math.max(0, n.sim)
      const total = Object.values(weights).reduce((a, b) => a + b, 0)
      const scores = Object.fromEntries(
        Object.entries(weights).map(([id, w]) => [id, total ? w / total : 1 / menu.length]),
      )
      const tier = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]

      return {
        tier,
        confidence: chanceRescaled(scores[tier], menu.length),
        scores,
        usage: { inputTokens: tokens, outputTokens: 0 },
        latencyMs: Math.round(performance.now() - started),
        ...(tokens >= contextTokens ? { inputTruncated: true } : {}),
      }
    },
  }
}
