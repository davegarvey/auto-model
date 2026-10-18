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

### 16. Embedding routers have short memories by construction (2026-10-18)
EmbeddingGemma, a typical small local embedding model, reads 2,048 tokens and silently truncates the rest: a 6,000-word input reported exactly 2,048 tokens read, with no error. Serialised in the natural order, a multi-turn state would lose the latest message, the part that matters most. The baseline therefore embeds the same state newest first, so truncation drops the oldest turns, and it flags truncation in the decision log.
- **Why it matters:** this is a structural reason, not just an empirical one, behind the claim that embedding routers struggle with long sessions. Their window is a quarter of Kev's validated context. The evaluation compares them on equal content, but not on equal reach.

### 17. Every router speaks a different confidence dialect (2026-10-18)
On the same three prompts, all three routers chose the expected tiers. Their confidences differed widely:
- the small LLM reported 0.90–0.95 every time;
- Kev reported 0.31–0.59, so two of three fell back under the 0.4 threshold;
- the embedding router reported anything from 0.36 to 1.00.

The small LLM (Gemma 4 E2B, thinking off, JSON output) took about 185 ms per decision once loaded, as fast as Kev on short states.
- **Why it matters:** a single fallback threshold cannot be fair to all routers, so the evaluation sweeps it per router. A text-generating router is not inherently slow when it is small, local and constrained to a one-token-ish JSON answer. The thesis's cost argument has to be tested on long states, not assumed.

### 18. The "right" tier is often a judgement call, even for the person labelling (2026-10-18)
Reviewing the router examples, the user agreed at once on most of them but found one genuinely two-sided: "refactor the payment flow so every external call is idempotent, about 40 files". It is large in scope and needs a large context. It is also largely mechanical work on existing code, which suggests medium. The example was replaced with an unambiguous one.
- **Why it matters:** routers are scored against one person's labels, and some prompts have no single correct tier. Agreement figures have a ceiling below 100%, and a disagreement is not always a routing error. The difficulty also splits along two axes, reasoning depth and context size, which a single small/medium/large ladder conflates.

### 20. Cold starts can silently disable a router (2026-10-18)
In the first end-to-end evaluation run, the embedding router failed every call. Loading `embeddinggemma` cold takes about 7.8 s, longer than the router's 5 s timeout. Each timed-out request was abandoned before the model finished loading, so the next request started cold again. The timeouts are now 30 s for all routers, and the evaluation warms each router up, unrecorded, before measuring.
- **Why it matters:** in a local set-up, the router's model shares a server that loads and evicts models on demand. A routing layer needs warm-up and generous timeouts, or it fails in a way that looks like "the router is bad" rather than "the router never ran". The decision log's `endpoint-error` reason is what made this visible.

### 21. The evaluation prompts were written to be unambiguous, so agreement is a best case (2026-10-18)
The 21 single prompts in `data/eval/prompts.jsonl` (7 per tier) were drafted by the assistant, not taken from real use, and written to sit clearly inside one tier. Four first drafts that could reasonably go either way were replaced rather than labelled. The user chose not to make judgement calls on individual labels.
- **Why it matters:** agreement on these prompts measures whether a router can tell clear cases apart, not how it handles the grey zone that entry 18 showed real requests contain. Read the single-prompt figures as an upper bound. The multi-turn session, where follow-ups inherit difficulty from context, is the harder and more realistic test.

## Evaluation results

### 22. A fallback threshold set in advance silently disabled the router (2026-10-18)
At the planned threshold of 0.4, 72% of Kev's decisions fell back to the default tier. On the 18-turn session, every turn but one ran on `medium` and the tier never changed. Kev proposed the labelled tier 74% of the time, but only 56% of applied tiers matched. Its median confidence was 0.25. At a threshold of 0.1, applied agreement rose to 69%.
- **Evidence:** `results/2026-10-18-ad716c3/report.md` (threshold 0.4) and `results/2026-10-18-615db61/report.md` (threshold 0.1).
- **Why it matters:** this is entry 9's warning realised. A safety net tuned without data turned automatic selection into "always medium", and nothing failed visibly. Only the decision log's reason codes showed it.

### 23. A small general model routed as well as the specialised one (2026-10-18)
Gemma 4 E2B, asked for a JSON answer, proposed the labelled tier 74% of the time, against Kev's 77%. The intervals overlap almost entirely (59–85% and 62–87%), and median latency was similar (140 ms against 131 ms). On session turns, Gemma was slightly ahead (72% against 67%). Its confidence carried no information: it never fell below 0.9, so its threshold sweep is flat.
- **Why it matters:** on this data, a purpose-built System One model gave no measurable accuracy advantage over a general 2B-class model running locally. What Kev offers is a probability over the choices, which makes a fallback possible but also obliges you to tune one. The sample is small; the honest reading is "no difference detected", not "no difference".

### 24. Where the routers go wrong matters more than how often (2026-10-18)
Almost all of Kev's errors fell on the border between `small` and `medium`: in the final run, 4 of 16 small cases went to medium and 4 of 13 medium cases went to small. It recognised 9 of 10 `large` cases. Gemma sent 5 of 13 `medium` cases to `small` in both runs, and sent one `large` case to `small`.
- **Evidence:** the confusion matrices in `results/2026-10-18-615db61/report.md`.
- **Why it matters:** the errors have different prices. Over-routing wastes compute, while under-routing hands real coding work to the weakest model. Agreement alone hides this; the confusion matrix is the more useful view for choosing a router.

### 25. The embedding baseline is weak, and biased towards the expensive tier (2026-10-18)
The k-nearest-neighbour router over 30 examples agreed with the labels 38% of the time, and 22% on session turns. It proposed `large` for 30 of 39 cases.
- **Why it matters:** with a few dozen examples, "nearest labelled prompt" mostly measures surface wording. The longer, context-laden states of a session look like the long `large` examples. Matching on embeddings is cheap, but it is not a substitute for a model that reads the request.

### 26. Hysteresis cost agreement and saved little (2026-10-18)
On the session, a 0.15 hysteresis margin cut Kev's switches from 7 to 5 and lowered agreement from 11/18 to 9/18. The switch it most often prevented, between `medium` and `large`, is Qwen's thinking toggle, which costs about 40 ms (entry 19). The margin is now 0 by default.
- **Why it matters:** damping is worth having only when switching is expensive. With tiers that share a model, it mostly delays the right answer.

### 27. A scripted session cannot test long context (2026-10-18)
The state-size sweep gave identical agreement at every budget, because the session's states were about 490 tokens and none was truncated. The session was scripted to keep labels clear-cut, which also kept it short.
- **Why it matters:** the question of whether a router benefits from more history, and Kev's 8k validated context, remain untested. Testing them needs long real sessions with tool output, and labelling those is exactly the judgement-heavy work that entries 18 and 21 describe.

### 28. Kev's answers vary between identical runs (2026-10-18)
Rerunning the same dataset gave 29 and then 30 correct proposals. Kev's server reports a sampling temperature of 2.41, and some low-confidence cases flipped.
- **Why it matters:** with confidences around 0.2, a router's choice on borderline cases is close to a coin toss. One run's agreement figure carries noise beyond its confidence interval.

### 29. Retries in the harness can resend a prompt (2026-10-18)
In the live session, `opencode run` stalled twice before reporting a session. The watchdog retried, and the prompt was routed three times, because the service had already accepted it.
- **Evidence:** `results/2026-10-18-live/`.
- **Why it matters:** this follows on from entry 12. Working around a flaky host changes what the selector sees, and the decision log is how you notice.

### 31. Kev's low confidence still ranks its answers well (2026-10-18)
Grouped by reported confidence, Kev's proposals in the final run were right as follows:
- below 0.2: 8 of 16;
- 0.2 to 0.3: 7 of 8;
- 0.3 to 0.4: 5 of 5;
- 0.4 and above: 10 of 10.

Above about 0.2, it was right in 22 of 23 cases. Falling back to `medium` below 0.2 does not help, though, because the default is no more often right for those cases. In the 0.4 run's sweep, a threshold of 0.2 scored 27/39 against 29/39 with none.
- **Evidence:** `results/2026-10-18-615db61/decisions.jsonl`, rows with `meta.run` of `main` and router `systemone`.
- **Why it matters:** the scale is unusual, but the signal is real. A confidence score can tell you when to doubt the router without telling you what to do instead. A fallback to a fixed tier is a guard against a broken router, not a way to improve accuracy. A more useful use of low confidence might be to escalate to the larger tier, or to ask the user.

### 32. The hosted original routed markedly better; this revises entry 23 (2026-10-18)
TypeSafe's hosted Jev (`jev-1.13`) proposed the labelled tier for 37 of 39 cases (95%, interval 83–99%) in each of three runs. The scoring code, configuration, prompts and labels were the same as before. Kev scored 30/39 and 29/39, and Gemma 29/39. On the same cases, Jev was right on 8 that Gemma missed and none the other way round (exact McNemar p = 0.008). Against Kev the margin was 9 against 2, or 10 against 2, depending on the run (p = 0.07 and 0.04).
- **Evidence:** `results/2026-10-18-jev-51a31cf/README.md`.
- **Why it matters:** entry 23's finding that a System One model offered no advantage over a general small model holds for Kev, a 4B open copy, but not for the original. The quality of the decision model matters, and on this data the small local options leave clear accuracy on the table. All of this is on clear-cut labels (entry 21), so 95% is a best case.

### 33. Same confidence scale, different temperament: the threshold trap was Kev's (2026-10-18)
Jev's confidence uses the same chance-rescaled formula as Kev's, as documented by TypeSafe: `(p_max − 1/n) / (1 − 1/n)`. But Jev's median confidence was 0.95, against Kev's 0.25. The 0.4 threshold that disabled Kev (entry 22) would have changed one of Jev's 39 decisions. All 31 cases at 0.8 or above were right, and both misses fell between 0.6 and 0.8. The threshold sweep found no setting that improved on no fallback.
- **Why it matters:** a confidence scale is not enough to choose a threshold. You also need the model's own distribution. A threshold copied from one System One model to another can be harmless or crippling.

### 34. Jev's answers were repeatable (2026-10-18)
Three runs made the same choice on all 39 cases, with probabilities differing by at most 0.09. No temperature or seed setting is documented. Kev, by contrast, flipped borderline cases between runs (entry 28).
- **Why it matters:** repeatability makes a router's behaviour testable and its log explainable. For Kev, much of the run-to-run noise came from low-confidence cases that a more decisive model doesn't have.

### 35. Buying the better router means a third party, a network hop and some unclear billing (2026-10-18)
Jev was reached through a reseller. TypeSafe was reported in September to have paused new sign-ups. Its API took TypeSafe's request body, but at a different path from the documented `/v1/systemone`, which had to be found in the reseller's page source. Its price was double TypeSafe's reported list price, charged on input tokens only. Jev also counted about twice as many input tokens as Kev for the same states. The responses reported $0.0025 per 39-case run, but the account balance fell by more than the reported charges added up to, and kept falling for a few minutes afterwards. Routing latency was a median of 356 ms (p95 1.2 s) including the network, against 84–140 ms locally. The response names TypeSafe as the provider, but nothing confirms that requests pass through unchanged.
- **Evidence:** `results/2026-10-18-jev-51a31cf/README.md`.
- **Why it matters:** the accuracy gain is real but comes bundled with the costs a local set-up avoids. The session text leaves the machine, there is a party in the middle, and the bill is hard to audit. At fractions of a cent per session, money is not the obstacle; trust and data handling are.

### 36. The weak embedding baseline was mostly a flawed test; this revises entry 25 (2026-10-18)
The original baseline embedded the whole routing state, a long structured block of the latest message, current tier, recent tools and earlier turns, and compared it with 30 bare example prompts of 8 to 16 words. Embedding only the latest message, prefixed like the examples, raised agreement from 15/39 to 30/39 (77%, interval 62–87%). The examples, model and k were unchanged. On the same cases, the latest-message version was right on 16 cases the original missed, and the original on 1 (exact McNemar p = 0.0003). The new version ties with Kev (7 cases each way) and Gemma (7 against 6). Jev beat it 8 cases to 1 (p = 0.04). Its proposals moved from 30 `large` to a spread of 10 / 18 / 11. Its main error is short small tasks sent to `medium` (7 of 16), at confidence of 0.45 or below.
- **Evidence:** `results/2026-10-18-embedding-latest-ac57158/README.md`.
- **Why it matters:** a baseline is only as fair as its set-up. The original compared unlike texts, and the router's bias towards `large` followed from that, not from embeddings as such. Once like was compared with like, a 30-example lookup matched the small local models on clear-cut requests. Entry 25's conclusion that embedding matching is "not a substitute for a model that reads the request" no longer stands on this data.

### 37. The scripted session can't test whether a router follows a conversation (2026-10-18)
Five session turns refer back to earlier work that sets their difficulty (turns 4, 6, 10, 11 and 16). The latest-message embedding, which sees none of the history, got 4 of them right, the same as Jev; Kev got 5 and Gemma 2. The follow-ups give themselves away: "Step back and reason…" nearly repeats a `large` example, and "Fix the failing test" resembles a `medium` one. The session was scripted to keep every label clear-cut (entry 21), so it contains no terse follow-up like "now fix it" or "try again" whose wording carries no sign of the task's difficulty.
- **Why it matters:** the blog's argument that an embedding of one request cannot follow a conversation is plausible but untested here. Five turns give intervals of 38–96%. Testing it needs real sessions with uninformative follow-ups, which are exactly the cases hard to label without judgement calls.

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

### 19. Measured switching costs: one free gear, and family does not help (2026-10-18)
This is a smoke run of the switching cost benchmark: 2,048-token context, one repetition, Kev stopped to free memory. All rows are times to first token.

| Transition | Reprocessed | Time |
|---|---|---|
| Qwen 3.6, thinking toggled (medium to large in the shipped design) | about 1% | 37 ms |
| gpt-oss, effort low to high | 99% | 1.4 s |
| Gemma to Qwen 3.6, already loaded | 100% | 1.9 s |
| Gemma to Qwen 3.6, not loaded | 100% | 9.8 s, of which 7.8 s loading |
| Qwen 3.6 35B to Qwen 3.8 27B, same family | about 100% | 15–17 s |

The last row is slow because Qwen 3.8 is a dense 27B model reading 2k tokens, against 1.9 s for the 35B mixture-of-experts Qwen 3.6.
- **Evidence:** a smoke output in the scratchpad. The full run (2k, 8k and 32k tokens, three repetitions) is task 8.1.
- **Why it matters:** this confirms entry 6 with numbers. Whether a "gear change" is free depends on where the model's template puts the setting: Qwen's thinking toggle sits at the end and reuses the cache, while gpt-oss's effort sits at the top and does not. A model from the same family shares nothing. Model size class matters more to switching cost than family, because a dense model re-reads context many times more slowly than a mixture-of-experts model of similar size. The shipped design's cheap switch is medium to large, and its expensive one is to and from small.

### 30. Full switching cost run: the costs grow faster than the context (2026-10-18)
This is the median of three repetitions at 2k and 8k tokens; 32k was dropped for time. Qwen's thinking toggle stayed free: 37 ms and 39 ms. Every other switch re-read the context, and quadrupling the context made the switches four to five times slower:
- gpt-oss effort change: 1.8 s, then 7.8 s;
- Gemma to Qwen 3.6, loaded: 1.9 s, then 9.4 s;
- Qwen 3.6 to Qwen 3.8: 16.5 s, then 78 s.
- **Evidence:** `results/2026-10-18-switch-cost/switch-cost.md`.
- **Why it matters:** this confirms entry 19 at scale. On a long local session, an unnecessary trip to the cheap tier costs seconds, and on a dense model tens of seconds. Routers should be judged on switching behaviour as well as agreement.

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
