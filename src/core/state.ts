// Builds the routing state: what a router sees about the session when choosing a tier.
// Field order is fixed so carried-over content keeps its position from one turn to the next
// (the decision model's server can then reuse work); content that changes every turn comes last.

export interface Message {
  from: "user" | "assistant"
  text: string
}

export interface ToolUse {
  name: string
  ok: boolean
}

export interface StateInput {
  /** Completed messages before the latest user message, oldest first. */
  history: Message[]
  /** Tools used during the previous turn. */
  recentTools?: ToolUse[]
  /** Tier currently applied to the session, if any. */
  currentTier?: string
  latestMessage: string
}

export interface StateOptions {
  budgetTokens: number
  /** Cap for any one earlier message, so a single long reply cannot crowd out the rest. */
  maxMessageTokens?: number
}

export interface RoutingState {
  /** The object sent as the System One `state`. */
  value: {
    earlier_turns: Message[]
    recent_tools: string[]
    current_tier: string
    latest_message: string
  }
  /** Serialised form; what embedding and LLM routers read. */
  text: string
  estimatedTokens: number
  truncated: boolean
  droppedMessages: number
}

const CHARS_PER_TOKEN = 3.5
const MARKER = " […] "

export const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN)

/** Shortens text to about `tokens`, keeping its start and end. */
function clip(text: string, tokens: number): string {
  const chars = Math.max(0, Math.floor(tokens * CHARS_PER_TOKEN) - MARKER.length)
  if (text.length <= chars + MARKER.length) return text
  const head = Math.ceil(chars * 0.7)
  return text.slice(0, head) + MARKER + text.slice(text.length - (chars - head))
}

const serialise = (value: RoutingState["value"]) => JSON.stringify(value)

export function buildState(input: StateInput, options: StateOptions): RoutingState {
  const maxMessageTokens = options.maxMessageTokens ?? 1024
  let truncated = false

  const history = input.history.map((m) => {
    const text = clip(m.text, maxMessageTokens)
    if (text !== m.text) truncated = true
    return { from: m.from, text }
  })
  const value: RoutingState["value"] = {
    earlier_turns: history,
    recent_tools: (input.recentTools ?? []).map((t) => (t.ok ? t.name : `${t.name} (failed)`)),
    current_tier: input.currentTier ?? "none",
    latest_message: input.latestMessage,
  }

  // Drop whole messages from the front until the state fits.
  let dropped = 0
  while (value.earlier_turns.length > 0 && estimateTokens(serialise(value)) > options.budgetTokens) {
    value.earlier_turns = value.earlier_turns.slice(1)
    dropped++
  }

  // The latest message alone may still be too long: clip it to whatever room is left.
  let text = serialise(value)
  if (estimateTokens(text) > options.budgetTokens) {
    const others = estimateTokens(serialise({ ...value, latest_message: "" }))
    // JSON escaping can inflate the clipped text, so shrink until it fits.
    for (let room = options.budgetTokens - others; room > 0; room = Math.floor(room * 0.9)) {
      value.latest_message = clip(input.latestMessage, room)
      text = serialise(value)
      if (estimateTokens(text) <= options.budgetTokens) break
    }
    truncated = true
  }

  return {
    value,
    text,
    estimatedTokens: estimateTokens(text),
    truncated: truncated || dropped > 0,
    droppedMessages: dropped,
  }
}
