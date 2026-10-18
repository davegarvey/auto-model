// Baseline: a small text-generating model asked to pick a tier, constrained to a JSON answer.
import type { Tier } from "./config.ts"
import { isRecord, postJSON, RouterError, type Router } from "./router.ts"
import { TIER_QUESTION } from "./systemone.ts"

export interface LlmOptions {
  baseURL: string
  model: string
  timeoutMs: number
}

/** Used when the model gives a valid tier but no usable confidence. Documented as uncalibrated. */
export const DEFAULT_CONFIDENCE = 0.5

export function llmMessages(menu: Tier[], stateText: string) {
  const tiers = menu.map((t) => `- ${t.id}: ${t.description}`).join("\n")
  return [
    {
      role: "system",
      content:
        "You route requests in a coding assistant to a tier of model. " +
        `${TIER_QUESTION}\n\nTiers:\n${tiers}\n\n` +
        'Answer with JSON only: {"tier": <tier id>, "confidence": <0 to 1, how sure you are>}.',
    },
    { role: "user", content: `Session state (JSON):\n${stateText}` },
  ]
}

export function parseLlmAnswer(content: unknown, menu: Tier[]): { tier: string; confidence: number } {
  if (typeof content !== "string") throw new RouterError("invalid-response", "LLM router returned no content")
  let answer: unknown
  try {
    answer = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))
  } catch {
    throw new RouterError("invalid-response", `LLM router answer is not JSON: ${content.slice(0, 120)}`)
  }
  if (!isRecord(answer) || typeof answer.tier !== "string" || !menu.some((t) => t.id === answer.tier))
    throw new RouterError("invalid-response", `LLM router did not name a valid tier: ${content.slice(0, 120)}`)
  const c = answer.confidence
  const confidence = typeof c === "number" && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : DEFAULT_CONFIDENCE
  return { tier: answer.tier, confidence }
}

export function llmRouter(options: LlmOptions): Router {
  const url = options.baseURL.replace(/\/+$/, "") + "/api/chat"
  return {
    name: "llm",
    model: options.model,
    async route(menu, state) {
      const started = performance.now()
      const body = await postJSON(
        url,
        {
          model: options.model,
          stream: false,
          think: false,
          options: { temperature: 0 },
          format: {
            type: "object",
            properties: {
              tier: { type: "string", enum: menu.map((t) => t.id) },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["tier", "confidence"],
          },
          messages: llmMessages(menu, state.text),
        },
        options.timeoutMs,
      )
      const message = isRecord(body) && isRecord(body.message) ? body.message : undefined
      const { tier, confidence } = parseLlmAnswer(message?.content, menu)
      return {
        tier,
        confidence,
        usage: {
          inputTokens: isRecord(body) && typeof body.prompt_eval_count === "number" ? body.prompt_eval_count : 0,
          outputTokens: isRecord(body) && typeof body.eval_count === "number" ? body.eval_count : 0,
        },
        latencyMs: Math.round(performance.now() - started),
      }
    },
  }
}
