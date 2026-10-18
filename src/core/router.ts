// The interface every router implements, so evaluation and live routing can swap them freely.
import type { Tier } from "./config.ts"
import type { RoutingState } from "./state.ts"

export interface RouterResult {
  tier: string
  /** 0..1. For the System One router this is the model's own confidence. */
  confidence: number
  /** Per-tier probabilities or scores, when the router provides them. */
  scores?: Record<string, number>
  usage: { inputTokens: number; outputTokens: number }
  latencyMs: number
  /** Version the router's model reported, if any. */
  modelVersion?: string
}

export interface Router {
  readonly name: string
  readonly model: string
  route(menu: Tier[], state: RoutingState): Promise<RouterResult>
}

export type RouterErrorKind = "unavailable" | "timeout" | "invalid-response"

export class RouterError extends Error {
  readonly kind: RouterErrorKind
  constructor(kind: RouterErrorKind, message: string) {
    super(message)
    this.name = "RouterError"
    this.kind = kind
  }
}

/** POSTs JSON with a timeout, mapping transport failures onto RouterError. */
export async function postJSON(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const name = (error as Error).name
    if (name === "TimeoutError" || name === "AbortError")
      throw new RouterError("timeout", `${url} did not answer within ${timeoutMs} ms`)
    throw new RouterError("unavailable", `${url}: ${(error as Error).message}`)
  }
  const text = await response.text()
  if (!response.ok) throw new RouterError("unavailable", `${url} returned ${response.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new RouterError("invalid-response", `${url} returned a body that is not JSON`)
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
