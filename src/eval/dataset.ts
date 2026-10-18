// Evaluation dataset: single labelled prompts and labelled multi-turn sessions, stored in version control.
//   data/eval/prompts.jsonl      one {"id", "text", "label", "note"?} per line
//   data/eval/sessions/*.json    {"id", "title", "source"?, "turns": [{"user", "assistant", "tools"?, "label"}]}
// Each label is the single tier the user would have picked.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { StateInput, ToolUse } from "../core/state.ts"

export interface PromptCase {
  id: string
  text: string
  label: string
  note?: string
}

export interface SessionTurn {
  /** What the user said this turn. */
  user: string
  /** What the assistant replied, summarised; becomes history for later turns. */
  assistant: string
  /** Tools the assistant used this turn; becomes "recent tools" for the next turn. */
  tools?: ToolUse[]
  label: string
}

export interface Session {
  id: string
  title: string
  source?: string
  turns: SessionTurn[]
}

export interface Dataset {
  prompts: PromptCase[]
  sessions: Session[]
}

export class DatasetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DatasetError"
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== ""

function checkLabel(label: unknown, tiers: string[], where: string): string {
  if (typeof label !== "string" || !tiers.includes(label))
    throw new DatasetError(`${where}: label ${JSON.stringify(label)} is not one of ${tiers.join(", ")}`)
  return label
}

export function parsePrompts(jsonl: string, tiers: string[], file = "prompts.jsonl"): PromptCase[] {
  const seen = new Set<string>()
  return jsonl
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => line.trim())
    .map(({ line, n }) => {
      const where = `${file}:${n}`
      let raw: unknown
      try {
        raw = JSON.parse(line)
      } catch {
        throw new DatasetError(`${where}: not valid JSON`)
      }
      if (!isRecord(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.text))
        throw new DatasetError(`${where}: needs a non-empty "id" and "text"`)
      if (seen.has(raw.id)) throw new DatasetError(`${where}: duplicate id "${raw.id}"`)
      seen.add(raw.id)
      return {
        id: raw.id,
        text: raw.text,
        label: checkLabel(raw.label, tiers, `${where} (${raw.id})`),
        ...(nonEmpty(raw.note) ? { note: raw.note } : {}),
      }
    })
}

export function parseSession(json: string, tiers: string[], file = "session.json"): Session {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new DatasetError(`${file}: not valid JSON`)
  }
  if (!isRecord(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.title))
    throw new DatasetError(`${file}: needs a non-empty "id" and "title"`)
  if (!Array.isArray(raw.turns) || raw.turns.length === 0) throw new DatasetError(`${file}: needs at least one turn`)
  const turns = raw.turns.map((t, i): SessionTurn => {
    const where = `${file} turn ${i + 1}`
    if (!isRecord(t) || !nonEmpty(t.user)) throw new DatasetError(`${where}: needs a non-empty "user"`)
    if (typeof t.assistant !== "string") throw new DatasetError(`${where}: needs an "assistant" summary`)
    const tools = t.tools === undefined ? undefined : t.tools
    if (tools !== undefined && (!Array.isArray(tools) || !tools.every((x) => isRecord(x) && nonEmpty(x.name) && typeof x.ok === "boolean")))
      throw new DatasetError(`${where}: "tools" must be a list of {"name", "ok"}`)
    return {
      user: t.user,
      assistant: t.assistant,
      ...(tools ? { tools: tools as ToolUse[] } : {}),
      label: checkLabel(t.label, tiers, where),
    }
  })
  return { id: raw.id, title: raw.title, ...(nonEmpty(raw.source) ? { source: raw.source } : {}), turns }
}

/** Loads and validates data/eval. Missing files mean an empty part, not an error. */
export function loadDataset(dir: string, tiers: string[]): Dataset {
  const promptsFile = path.join(dir, "prompts.jsonl")
  const prompts = existsSync(promptsFile) ? parsePrompts(readFileSync(promptsFile, "utf8"), tiers, promptsFile) : []
  const sessionsDir = path.join(dir, "sessions")
  const sessions = existsSync(sessionsDir)
    ? readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => parseSession(readFileSync(path.join(sessionsDir, f), "utf8"), tiers, path.join(sessionsDir, f)))
    : []
  const ids = new Set<string>()
  for (const s of sessions) {
    if (ids.has(s.id)) throw new DatasetError(`duplicate session id "${s.id}"`)
    ids.add(s.id)
  }
  return { prompts, sessions }
}

/**
 * The state a session turn would produce in live routing: earlier turns as history, the previous turn's tools
 * as recent tools, and the label of the previous turn as the current tier (as if routing had matched the user).
 */
export function turnStateInput(session: Session, index: number, currentTier?: string): StateInput {
  const history = session.turns.slice(0, index).flatMap((t) => [
    { from: "user" as const, text: t.user },
    ...(t.assistant.trim() ? [{ from: "assistant" as const, text: t.assistant }] : []),
  ])
  const previous = index > 0 ? session.turns[index - 1] : undefined
  return {
    history,
    recentTools: previous?.tools ?? [],
    latestMessage: session.turns[index].user,
    ...(currentTier ? { currentTier } : {}),
  }
}

/** Every user-authored text in the dataset, for the overlap check against router examples. */
export const datasetTexts = (d: Dataset) => [...d.prompts.map((p) => p.text), ...d.sessions.flatMap((s) => s.turns.map((t) => t.user))]
