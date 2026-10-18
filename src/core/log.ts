// Decision log: one JSON object per line, appended and never rewritten.
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

export type Reason = "decision" | "low-confidence-fallback" | "hysteresis-hold" | "endpoint-error" | "manual-override"

export interface DecisionRecord {
  ts: string
  sessionID: string
  parentSessionID?: string
  router: string
  /** Model identifier the router was asked to use, and the one it reported running. */
  decisionModel: string
  decisionModelVersion?: string
  proposedTier?: string
  appliedTier: string
  targetModel: string
  previousTier?: string
  confidence?: number
  probabilities?: Record<string, number>
  reason: Reason
  switched: boolean
  latencyMs: number
  state: { estimatedTokens: number; chars: number; truncated: boolean; droppedMessages: number }
  /** The router's model read less than the whole state. */
  routerInputTruncated?: boolean
  usage: { inputTokens: number; outputTokens: number }
  costUSD: number
  error?: string
  /** Free-form extras, such as the evaluation case being scored. */
  meta?: Record<string, unknown>
  /** The state sent to the router; only written when capture is enabled. */
  stateText?: string
}

export async function appendDecision(file: string, record: DecisionRecord, options: { captureState: boolean }) {
  const { stateText, ...rest } = record
  const line = JSON.stringify(options.captureState && stateText !== undefined ? { ...rest, stateText } : rest)
  await mkdir(path.dirname(file), { recursive: true })
  // A single append per record: O_APPEND writes of one buffer do not interleave with other writers.
  await appendFile(file, line + "\n", { flag: "a" })
}
