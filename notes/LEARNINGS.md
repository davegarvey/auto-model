# Learnings

A running log of findings from building the selector, kept for the blog post on automatic model selection. Each entry says what was found, the evidence for it, and why it matters. Entries are added as they happen and are not edited afterwards, except to correct a mistake. Later results may revise earlier ones; when they do, a new entry says so.

## Feasibility and integration

### 1. A coding agent can switch models mid-session with very little code (2026-10-18)
OpenCode v2 lets a plugin call `switchModel` when a user message arrives, and the change applies to that same turn. The runner reloads the session's model before every step, so nothing needs intercepting or proxying.
- **Evidence:** `notes/spike-switch.md`. The switch took 5 ms, and the turn's first request went to the new model.
- **Why it matters:** the plumbing for automatic selection is already in agents built for manual selection. The hard part is the decision, not the switch.

### 2. The documentation trails the product (2026-10-18)
OpenCode's public plugin documentation describes the v1 API, and the installed plugin package is v1 as well. The v2 API that makes this possible was only discoverable by reading the source.
- **Why it matters:** building on this today means building on moving, partly undocumented ground. This is part of the "how easy was it" answer.

### 3. Agents make model calls you did not choose (2026-10-18)
Besides the turns you route, OpenCode makes auxiliary requests: session titles, compaction and summaries. These go to a separately configured "small model". With the user's global config, the first prompt of every session was sent to a hosted OpenAI model for titling, even though every turn ran locally.
- **Evidence:** `notes/spike-switch.log.txt`, the `kind=title` request.
- **Why it matters:** "automatic model selection" in an agent is more than the main turn. A selector that covers only user turns leaves cost, latency and privacy decisions elsewhere unexamined.

### 12. The agent's harness is the flakiest part (2026-10-18)
- **`opencode run` stalls.** OpenCode 2.0.30's `opencode run` stalled before creating a session on roughly every other invocation, with no error, in both standalone and service mode. The repository now runs it through `scripts/oc-run.sh`, which retries when no session appears within 25 s.
- **A prompt bypassed the plugin.** Once, the first prompt after the service re-initialised the project ran with the plugin loaded but its prompt hook never called. The turn went to the default model unrouted.
- **Errors are hard to see.** OpenCode's background service does not capture plugin console output, so the plugin writes its own diagnostics to `~/.local/state/auto-model/plugin.log`.
- **Why it matters:** much of the effort in "automatic model selection in a coding agent" went into the host agent, not the decision. A real deployment needs the routing hook to be guaranteed, or a decision log that shows when it was skipped.

### 13. The cheap tier delegates (2026-10-18)
Asked a one-line question, the small tier (Gemma 4 E2B) started a sub-agent to look it up. The plugin routed that sub-agent separately, also to small, and logged it with its parent's session ID.
- **Why it matters:** routing per sub-agent matters in practice, not just in principle. Even trivial turns can fan out into several model calls, each needing its own decision.

### 14. Context makes decisions sticky, for better and worse (2026-10-18)
In a session whose history was a hard deadlock analysis, Kev proposed `large` even for "Reply with just: one". Its confidence was low, so the fallback applied `medium`. With an empty history, the same kind of trivial request goes to `small` with 0.8 confidence.
- **Evidence:** `~/.local/state/auto-model/decisions.jsonl`, session `…QBcTC5xb`, 11:10.
- **Why it matters:** this is the argument for session context ("now fix it" must inherit the task's difficulty) seen from the other side: a trivial aside inherits it too. Whether context helps on balance is exactly what the evaluation's state-size sweep has to measure.

### 15. Plugins have no clean way to talk to the user (2026-10-18)
A server-side OpenCode plugin can register a `/auto-model` command, but its only way to reply is a synthetic message. OpenCode queues that message and delivers it with the next turn, so the model reads it as well. The plugin's per-session state (current tier, manual override) is also in memory and resets whenever OpenCode reloads the plugin.
- **Why it matters:** an automatic selector needs a visible, out-of-band channel ("switched to large because …") and durable state. Neither comes for free from today's agent plugin APIs.

## Tiers, reasoning levels and switching cost

### 4. "Reasoning effort" is often just on or off (2026-10-18)
Qwen 3.6 gave identical behaviour at low, medium and high effort; only thinking on versus off differed. Ollama maps every effort level to "on" for models with boolean thinking. gpt-oss is the only installed model with three real levels.
- **Evidence:** the local probe recorded in the design. Qwen produced about 950, 945 and 808 output tokens at low, medium and high.
- **Why it matters:** a menu of "same model at different reasoning levels" offers fewer real gears than it appears to. The tiers have to be checked, not assumed.

### 5. The gap between gears is real (2026-10-18)
Qwen 3.6 with thinking off answered an easy arithmetic question wrongly three times out of three (205, 206, 186). With thinking on it was correct every time, at about a hundred times the time.
- **Why it matters:** this is the case for selection in one example. The cheap gear is not just slower to give up on; it is sometimes wrong, and the expensive one is far slower.

### 6. Switching cost depends on where a model's template puts the reasoning setting (2026-10-18)
Changing gpt-oss's effort forced a full re-read of a 6,000-token prompt: 4.4 s, against 0.02 s with the cache reused. Its template writes `Reasoning: high` at the top of the system prompt, so everything after it is invalidated. Switching to a different model always means a full re-read, whatever the family, because the cache belongs to the weights.
- **Evidence:** the probe in the design. A full measurement is planned (task 7.4).
- **Why it matters:** "same model, different effort" sounds free to switch, and sometimes is. Whether it is depends on an implementation detail no user would see.

## The decision model

### 7. Kev runs locally, routes sensibly, and is not free in time (2026-10-18)
On short prompts, Kev-4B chose the tiers a person would: a variable rename went to small (0.82 confidence), a production deadlock to large, and writing a unit test to medium. Each decision took 150–260 ms once warm.
- **Evidence:** `notes/spike-kev.md` and `route-once` runs.

### 8. The routing cost grows with context on consumer hardware (2026-10-18)
Kev has to read its whole input before deciding, at about 1,200 tokens per second here. Its server reuses work only for a byte-identical state, and each turn's state differs. So a routing call costs about 0.8 ms per token of state on every turn: about 1.6 s at 2k tokens and 6.5 s at the 8k cap. On a datacentre GPU, Kev's own figures are tens of milliseconds.
- **Why it matters:** "fast and cheap" for System One models is partly a statement about hardware. Locally, the per-turn cost is a few seconds. That is small next to a long turn on a large model, but not negligible, and it argues for decision servers that reuse prefixes.

### 9. Confidence needs reading on its own scale (2026-10-18)
Kev's reported confidence rescales the top probability from chance (one in three) up to one, so a tier with probability 0.72 reports a confidence of about 0.58. On long states, confidence ran low (0.22–0.46), below the default fallback threshold.
- **Why it matters:** a fallback threshold chosen in advance can quietly disable the router. It has to be set from data, which is why the evaluation sweeps it.

### 10. The local memory budget is tight but workable (2026-10-18)
Steady use takes about 37 GB: Kev-4B 10 GB, Gemma 6 GB and Qwen 21 GB. Kev peaks at 18 GB while loading, because only its adapter form is published, which brings the total to about 45 GB on a 64 GB machine.
- **Why it matters:** a local "System One plus several gears" set-up fits on a well-specified laptop, but not with much room to spare. That limits how many distinct models a local menu can hold.

## Packaging

### 11. Containers are the wrong default for local AI on a Mac (2026-10-18)
Docker on macOS cannot use the Apple GPU, so models in containers fall back to the CPU. Native tools (Ollama, MLX, uv) are the practical route.
- **Why it matters:** "just ship a container" does not carry over to local models on the hardware many developers use.
