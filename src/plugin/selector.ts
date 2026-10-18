// Per-session routing for OpenCode: decides the tier when a prompt arrives, applies it with switchModel,
// detects manual model changes, and logs every decision. OpenCode access goes through SessionPort so this
// can be tested without OpenCode.
import { appendFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import type { Config, Tier } from "../core/config.ts"
import { appendDecision, type DecisionRecord } from "../core/log.ts"
import { modelRef, routeTurn } from "../core/route.ts"
import type { Router } from "../core/router.ts"
import { historyFromMessages, type SessionMessage } from "./history.ts"

export interface ModelRef {
  providerID: string
  id: string
  variant?: string
}

export interface SessionPort {
  get(sessionID: string): Promise<{ model?: ModelRef; parentID?: string }>
  context(sessionID: string): Promise<ReadonlyArray<SessionMessage>>
  switchModel(sessionID: string, model: ModelRef): Promise<void>
}

export type Logger = (record: DecisionRecord) => Promise<void>

/** Plugin diagnostics, written beside the decision log: OpenCode's service does not capture console output. */
export function diagnose(config: Config, message: string) {
  try {
    const file = path.join(path.dirname(config.log.path), "plugin.log")
    mkdirSync(path.dirname(file), { recursive: true })
    appendFileSync(file, `${new Date().toISOString()} ${message}\n`)
  } catch {}
}

/** Prefix of status lines the plugin writes into a session; they are kept out of routing state. */
export const STATUS_PREFIX = "[auto-model]"

interface SessionEntry {
  currentTier?: string
  /** Model reference the plugin last applied; a different one on the next prompt means the user changed it. */
  applied?: string
  overridden: boolean
  disabled: boolean
}

export const refToString = (ref: ModelRef) => `${ref.providerID}/${ref.id}${ref.variant ? `#${ref.variant}` : ""}`

export function parseRef(ref: string): ModelRef {
  const slash = ref.indexOf("/")
  const hash = ref.indexOf("#", slash + 1)
  const id = hash === -1 ? ref.slice(slash + 1) : ref.slice(slash + 1, hash)
  return { providerID: ref.slice(0, slash), id, ...(hash === -1 ? {} : { variant: ref.slice(hash + 1) }) }
}

/** The tier whose model reference matches, if any. */
export function tierForModel(tiers: Tier[], ref: ModelRef | undefined): string | undefined {
  if (!ref) return undefined
  const s = refToString(ref)
  return tiers.find((t) => modelRef(t) === s)?.id
}

export class Selector {
  readonly config: Config
  readonly router: Router
  readonly port: SessionPort
  readonly log: Logger
  readonly diagnose: (message: string) => void
  readonly sessions = new Map<string, SessionEntry>()

  constructor(config: Config, router: Router, port: SessionPort, log?: Logger, diagnostics?: (message: string) => void) {
    this.config = config
    this.diagnose = diagnostics ?? ((message) => diagnose(config, message))
    this.router = router
    this.port = port
    this.log = log ?? ((record) => appendDecision(config.log.path, record, { captureState: config.log.captureState }))
  }

  entry(sessionID: string): SessionEntry {
    let entry = this.sessions.get(sessionID)
    if (!entry) this.sessions.set(sessionID, (entry = { overridden: false, disabled: false }))
    return entry
  }

  /** Called from OpenCode's prompt hook. Never throws: routing must not block the user's request. */
  async onPrompt(sessionID: string, prompt: string): Promise<DecisionRecord | undefined> {
    this.diagnose(`prompt ${sessionID} (${prompt.length} chars)`)
    if (!this.config.enabled || prompt.startsWith(STATUS_PREFIX)) return undefined
    const entry = this.entry(sessionID)
    if (entry.disabled || entry.overridden) return undefined
    try {
      const session = await this.port.get(sessionID)
      const sessionModel = session.model ? refToString(session.model) : undefined

      if (entry.applied && sessionModel && sessionModel !== entry.applied) {
        entry.overridden = true
        const record = this.overrideRecord(sessionID, session.parentID, sessionModel, entry)
        await this.log(record)
        return record
      }

      const currentTier = entry.currentTier ?? tierForModel(this.config.tiers, session.model)
      const messages = (await this.port.context(sessionID)).filter((m) => !m.text?.startsWith(STATUS_PREFIX))
      const { history, recentTools } = historyFromMessages(messages, prompt)
      const { record, appliedTier, targetModel } = await routeTurn({
        config: this.config,
        router: this.router,
        sessionID,
        ...(session.parentID ? { parentSessionID: session.parentID } : {}),
        state: { history, recentTools, latestMessage: prompt, ...(currentTier ? { currentTier } : {}) },
      })

      if (targetModel !== sessionModel) await this.port.switchModel(sessionID, parseRef(targetModel))
      record.switched = targetModel !== sessionModel
      entry.currentTier = appliedTier
      entry.applied = targetModel
      await this.log(record)
      return record
    } catch (error) {
      this.diagnose(`routing failed for ${sessionID}: ${(error as Error).stack ?? error}`)
      return undefined
    }
  }

  /** `/auto-model on|off|status` for one session. Returns the line to show the user. */
  command(sessionID: string, argument: string): string {
    const entry = this.entry(sessionID)
    const arg = argument.trim().toLowerCase()
    if (arg === "on") {
      entry.disabled = false
      entry.overridden = false
      entry.applied = undefined
      return `${STATUS_PREFIX} automatic routing is on for this session.`
    }
    if (arg === "off") {
      entry.disabled = true
      return `${STATUS_PREFIX} automatic routing is off for this session; the current model stays.`
    }
    const state = !this.config.enabled
      ? "off (disabled in configuration)"
      : entry.disabled
        ? "off"
        : entry.overridden
          ? "paused (you chose a model by hand; /auto-model on resumes)"
          : "on"
    const tier = entry.currentTier ? `, current tier ${entry.currentTier} (${entry.applied})` : ""
    return `${STATUS_PREFIX} routing ${state}${tier}; router ${this.router.name} (${this.router.model}).`
  }

  private overrideRecord(sessionID: string, parentID: string | undefined, model: string, entry: SessionEntry) {
    const tier = tierForModel(this.config.tiers, parseRef(model))
    const record: DecisionRecord = {
      ts: new Date().toISOString(),
      sessionID,
      ...(parentID ? { parentSessionID: parentID } : {}),
      router: this.router.name,
      decisionModel: this.router.model,
      appliedTier: tier ?? "manual",
      targetModel: model,
      ...(entry.currentTier ? { previousTier: entry.currentTier } : {}),
      reason: "manual-override",
      switched: false,
      latencyMs: 0,
      state: { estimatedTokens: 0, chars: 0, truncated: false, droppedMessages: 0 },
      usage: { inputTokens: 0, outputTokens: 0 },
      costUSD: 0,
    }
    return record
  }
}
