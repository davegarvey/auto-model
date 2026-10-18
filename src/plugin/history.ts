// Converts OpenCode v2 session messages into the routing core's history and recent-tool list.
// Only the fields the router needs are read, so this stays tolerant of schema additions.
import type { Message, ToolUse } from "../core/state.ts"

/** The subset of OpenCode's Session.Message.Info this module reads. */
export interface SessionMessage {
  type: string
  text?: string
  content?: ReadonlyArray<{ type: string; text?: string; name?: string; state?: { status?: string } }>
}

export interface History {
  history: Message[]
  recentTools: ToolUse[]
}

/**
 * @param latestPrompt the prompt being routed; dropped from the history if OpenCode has already recorded it.
 */
export function historyFromMessages(messages: ReadonlyArray<SessionMessage>, latestPrompt?: string): History {
  const history: Message[] = []
  let recentTools: ToolUse[] = []

  for (const message of messages) {
    if (message.type === "user" || message.type === "synthetic") {
      if (message.text?.trim()) history.push({ from: "user", text: message.text })
      recentTools = []
      continue
    }
    if (message.type !== "assistant") continue

    const texts: string[] = []
    const tools: ToolUse[] = []
    for (const part of message.content ?? []) {
      if (part.type === "text" && part.text?.trim()) texts.push(part.text.trim())
      if (part.type === "tool" && part.name) tools.push({ name: part.name, ok: part.state?.status !== "error" })
    }
    recentTools.push(...tools)
    const text = texts.join("\n") || (tools.length ? `[used tools: ${tools.map((t) => t.name).join(", ")}]` : "")
    if (!text) continue
    // One turn can span several assistant messages (one per step); merge them into one.
    const last = history.at(-1)
    if (last?.from === "assistant") last.text += "\n" + text
    else history.push({ from: "assistant", text })
  }

  const last = history.at(-1)
  if (latestPrompt !== undefined && last?.from === "user" && last.text === latestPrompt) history.pop()
  return { history, recentTools }
}
