// Runs routers over the labelled dataset and computes agreement, latency, cost, a confidence-threshold sweep,
// a state-size sweep and a hysteresis simulation. Routers are injected, so this runs against stubs in tests
// and against the live servers from run.ts.
import type { Config } from "../core/config.ts"
import type { DecisionRecord, Reason } from "../core/log.ts"
import { routeTurn } from "../core/route.ts"
import type { Router } from "../core/router.ts"
import { buildState, type StateInput } from "../core/state.ts"
import { type Dataset, datasetTexts, turnStateInput } from "./dataset.ts"
import { findOverlaps, type Example } from "./overlap.ts"
import { agreement, median, percentile, type Agreement } from "./stats.ts"

export interface CaseResult {
  router: string
  kind: "prompt" | "turn"
  caseID: string
  label: string
  proposed?: string
  applied: string
  confidence?: number
  reason: Reason
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUSD: number
  error?: string
}

export interface SweepRow {
  threshold: number
  agreement: Agreement
  fallbackRate: number
}

export interface SessionSimulation {
  session: string
  turns: number
  withHysteresis: { agreement: Agreement; switches: number }
  withoutHysteresis: { agreement: Agreement; switches: number }
}

export interface RouterSummary {
  router: string
  model: string
  modelVersion?: string
  /** Proposed tier against the label, before any fallback or hysteresis. */
  overall: Agreement
  prompts: Agreement
  turns: Agreement
  /** Applied tier against the label, with the configured threshold and margin. */
  applied: Agreement
  confusion: Record<string, Record<string, number>>
  latency: { median: number; p95: number }
  tokens: { input: number; output: number }
  costUSD: number
  errors: number
  thresholdSweep: SweepRow[]
  sessions: SessionSimulation[]
}

export interface StateSizeRow {
  budgetTokens: number
  agreement: Agreement
  medianLatencyMs: number
  medianStateTokens: number
  truncatedTurns: number
}

export interface EvaluationResult {
  summaries: RouterSummary[]
  stateSize?: { router: string; rows: StateSizeRow[] }
  cases: CaseResult[]
  decisions: DecisionRecord[]
}

export interface EvaluateInput {
  config: Config
  routers: Router[]
  dataset: Dataset
  /** The embedding router's labelled examples; evaluation refuses to run if any overlaps the dataset. */
  routerExamples?: Example[]
  thresholds?: number[]
  stateBudgets?: number[]
  /** Router used for the state-size sweep. */
  stateSizeRouter?: string
  /** Call each router once, unrecorded, before measuring, so latencies exclude one-off model loading. Default true. */
  warmUp?: boolean
  onProgress?: (message: string) => void
}

export const DEFAULT_THRESHOLDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
export const DEFAULT_STATE_BUDGETS = [2048, 4096, 8192, 16384]

const switchCount = (tiers: string[]) => tiers.reduce((n, t, i) => n + (i > 0 && t !== tiers[i - 1] ? 1 : 0), 0)

function toCase(router: Router, kind: CaseResult["kind"], caseID: string, label: string, r: DecisionRecord): CaseResult {
  return {
    router: router.name,
    kind,
    caseID,
    label,
    ...(r.proposedTier ? { proposed: r.proposedTier } : {}),
    applied: r.appliedTier,
    ...(r.confidence !== undefined ? { confidence: r.confidence } : {}),
    reason: r.reason,
    latencyMs: r.latencyMs,
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
    costUSD: r.costUSD,
    ...(r.error ? { error: r.error } : {}),
  }
}

/** What would have been applied at a given threshold, ignoring hysteresis. */
export function appliedAtThreshold(c: CaseResult, threshold: number, defaultTier: string): string {
  if (c.error || c.proposed === undefined) return defaultTier
  return (c.confidence ?? 0) < threshold ? defaultTier : c.proposed
}

export function thresholdSweep(cases: CaseResult[], thresholds: number[], defaultTier: string): SweepRow[] {
  return thresholds.map((threshold) => {
    const applied = cases.map((c) => ({ label: c.label, chosen: appliedAtThreshold(c, threshold, defaultTier) }))
    const fellBack = cases.filter((c) => c.error || c.proposed === undefined || (c.confidence ?? 0) < threshold).length
    return { threshold, agreement: agreement(applied), fallbackRate: cases.length ? fellBack / cases.length : 0 }
  })
}

export function confusion(cases: CaseResult[], tiers: string[]) {
  const m: Record<string, Record<string, number>> = {}
  for (const label of tiers) m[label] = Object.fromEntries([...tiers, "error"].map((t) => [t, 0]))
  for (const c of cases) m[c.label][c.proposed ?? "error"]++
  return m
}

export async function evaluate(input: EvaluateInput): Promise<EvaluationResult> {
  const { config, dataset } = input
  const tiers = config.tiers.map((t) => t.id)
  const progress = input.onProgress ?? (() => {})

  if (input.routerExamples) {
    const overlaps = findOverlaps(input.routerExamples, datasetTexts(dataset))
    if (overlaps.length)
      throw new Error(
        `evaluation prompts overlap the router examples: ${overlaps.map((o) => `${o.exampleID} ~ "${o.evalText}"`).join("; ")}`,
      )
  }

  const decisions: DecisionRecord[] = []
  const allCases: CaseResult[] = []
  const summaries: RouterSummary[] = []

  const route = async (
    router: Router,
    state: StateInput,
    sessionID: string,
    meta: Record<string, unknown>,
    overrides: { margin?: number; budgetTokens?: number } = {},
  ) => {
    const cfg = overrides.margin === undefined ? config : { ...config, policy: { ...config.policy, margin: overrides.margin } }
    const { record } = await routeTurn({
      config: cfg,
      router,
      state,
      sessionID,
      meta,
      ...(overrides.budgetTokens ? { budgetTokens: overrides.budgetTokens } : {}),
    })
    decisions.push(record)
    return record
  }

  if (input.warmUp ?? true)
    for (const router of input.routers) {
      progress(`${router.name}: warming up`)
      await router
        .route(config.tiers, buildState({ history: [], latestMessage: "warm-up" }, { budgetTokens: 256 }))
        .catch(() => {})
    }

  for (const router of input.routers) {
    const cases: CaseResult[] = []
    let modelVersion: string | undefined

    for (const p of dataset.prompts) {
      progress(`${router.name}: prompt ${p.id}`)
      const r = await route(router, { history: [], latestMessage: p.text }, `eval:${p.id}`, {
        run: "main",
        case: p.id,
        label: p.label,
      })
      modelVersion ??= r.decisionModelVersion
      cases.push(toCase(router, "prompt", p.id, p.label, r))
    }

    const sessions: SessionSimulation[] = []
    for (const s of dataset.sessions) {
      const runs: Record<"with" | "without", string[]> = { with: [], without: [] }
      for (const mode of ["with", "without"] as const) {
        let current: string | undefined
        for (let i = 0; i < s.turns.length; i++) {
          const caseID = `${s.id}#${i + 1}`
          progress(`${router.name}: ${caseID} (${mode} hysteresis)`)
          const r = await route(
            router,
            turnStateInput(s, i, current),
            `eval:${s.id}:${mode}`,
            { run: mode === "with" ? "main" : "no-hysteresis", case: caseID, label: s.turns[i].label },
            mode === "with" ? {} : { margin: 0 },
          )
          current = r.appliedTier
          runs[mode].push(r.appliedTier)
          if (mode === "with") cases.push(toCase(router, "turn", caseID, s.turns[i].label, r))
        }
      }
      const labels = s.turns.map((t) => t.label)
      const pairs = (applied: string[]) => applied.map((chosen, i) => ({ label: labels[i], chosen }))
      sessions.push({
        session: s.id,
        turns: s.turns.length,
        withHysteresis: { agreement: agreement(pairs(runs.with)), switches: switchCount(runs.with) },
        withoutHysteresis: { agreement: agreement(pairs(runs.without)), switches: switchCount(runs.without) },
      })
    }

    const proposed = (cs: CaseResult[]) => agreement(cs.map((c) => ({ label: c.label, chosen: c.proposed })))
    summaries.push({
      router: router.name,
      model: router.model,
      ...(modelVersion ? { modelVersion } : {}),
      overall: proposed(cases),
      prompts: proposed(cases.filter((c) => c.kind === "prompt")),
      turns: proposed(cases.filter((c) => c.kind === "turn")),
      applied: agreement(cases.map((c) => ({ label: c.label, chosen: c.applied }))),
      confusion: confusion(cases, tiers),
      latency: { median: median(cases.map((c) => c.latencyMs)), p95: percentile(cases.map((c) => c.latencyMs), 95) },
      tokens: {
        input: cases.reduce((n, c) => n + c.inputTokens, 0),
        output: cases.reduce((n, c) => n + c.outputTokens, 0),
      },
      costUSD: cases.reduce((n, c) => n + c.costUSD, 0),
      errors: cases.filter((c) => c.error).length,
      thresholdSweep: thresholdSweep(cases, input.thresholds ?? DEFAULT_THRESHOLDS, config.defaultTier),
      sessions,
    })
    allCases.push(...cases)
  }

  // State-size sweep: the same session turns at each budget, with the previous turn's label as the current tier,
  // so the only thing that changes between rows is how much history the router sees.
  let stateSize: EvaluationResult["stateSize"]
  const sweepRouter = input.routers.find((r) => r.name === (input.stateSizeRouter ?? "systemone"))
  if (sweepRouter && dataset.sessions.length) {
    const rows: StateSizeRow[] = []
    for (const budgetTokens of input.stateBudgets ?? DEFAULT_STATE_BUDGETS) {
      const pairs: Array<{ label: string; chosen: string | undefined }> = []
      const latencies: number[] = []
      const sizes: number[] = []
      let truncatedTurns = 0
      for (const s of dataset.sessions)
        for (let i = 0; i < s.turns.length; i++) {
          const caseID = `${s.id}#${i + 1}`
          progress(`${sweepRouter.name}: ${caseID} at ${budgetTokens} tokens`)
          const r = await route(
            sweepRouter,
            turnStateInput(s, i, i > 0 ? s.turns[i - 1].label : undefined),
            `eval:${s.id}:budget-${budgetTokens}`,
            { run: "state-size", budgetTokens, case: caseID, label: s.turns[i].label },
            { budgetTokens },
          )
          pairs.push({ label: s.turns[i].label, chosen: r.proposedTier })
          latencies.push(r.latencyMs)
          sizes.push(r.state.estimatedTokens)
          if (r.state.truncated) truncatedTurns++
        }
      rows.push({
        budgetTokens,
        agreement: agreement(pairs),
        medianLatencyMs: median(latencies),
        medianStateTokens: median(sizes),
        truncatedTurns,
      })
    }
    stateSize = { router: sweepRouter.name, rows }
  }

  return { summaries, ...(stateSize ? { stateSize } : {}), cases: allCases, decisions }
}
