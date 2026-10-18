// Router backed by a System One decision model (Kev, or TypeSafe's Jev) over POST /v1/systemone.
import type { Tier } from "./config.ts"
import { isRecord, postJSON, RouterError, type Router, type RouterResult } from "./router.ts"
import type { RoutingState } from "./state.ts"

export const TIER_QUESTION =
  "Which tier of model should handle the latest message, given the conversation so far? " +
  "Prefer the cheapest tier that can do the job well."

export interface SystemOneOptions {
  baseURL: string
  model: string
  timeoutMs: number
}

export function systemOneRequest(model: string, menu: Tier[], state: RoutingState) {
  return {
    model,
    state: state.value,
    questions: {
      tier: {
        type: "choice",
        instructions: TIER_QUESTION,
        criteria: Object.fromEntries(menu.map((t) => [t.id, t.description])),
      },
    },
  }
}

/** Checks a /v1/systemone response and extracts the tier answer. */
export function parseSystemOneResponse(body: unknown, menu: Tier[]): Omit<RouterResult, "latencyMs"> {
  const invalid = (why: string) => new RouterError("invalid-response", `System One response ${why}`)
  if (!isRecord(body) || !isRecord(body.answers)) throw invalid("has no answers")
  const answer = body.answers.tier
  if (!isRecord(answer) || answer.type !== "choice") throw invalid("has no choice answer for the tier question")
  const ids = menu.map((t) => t.id)
  if (typeof answer.choice !== "string" || !ids.includes(answer.choice)) throw invalid("chose an unknown tier")
  if (typeof answer.confidence !== "number" || answer.confidence < 0 || answer.confidence > 1)
    throw invalid("has no valid confidence")
  const scores: Record<string, number> = {}
  if (isRecord(answer.probabilities))
    for (const id of ids) {
      const p = answer.probabilities[id]
      if (typeof p === "number") scores[id] = p
    }
  const usage = isRecord(body.usage) ? body.usage : {}
  return {
    tier: answer.choice,
    confidence: answer.confidence,
    ...(Object.keys(scores).length === ids.length ? { scores } : {}),
    usage: {
      inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
      outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
    },
    ...(typeof body.model === "string" ? { modelVersion: body.model } : {}),
  }
}

export function systemOneRouter(options: SystemOneOptions): Router {
  const url = options.baseURL.replace(/\/+$/, "") + "/v1/systemone"
  return {
    name: "systemone",
    model: options.model,
    async route(menu, state) {
      const started = performance.now()
      const body = await postJSON(url, systemOneRequest(options.model, menu, state), options.timeoutMs)
      return { ...parseSystemOneResponse(body, menu), latencyMs: Math.round(performance.now() - started) }
    },
  }
}
