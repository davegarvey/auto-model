# Automatic model selection in a local coding agent: what a proof of concept showed

## The question

Coding agents ask you to pick a model, and usually a reasoning level as well. The thesis behind this repository is that this choice will move from the user to the agent: a small, fast "System One" model reads the session and picks the cheapest model that can handle each request. This proof of concept tested that thesis on one laptop (a 64 GB MacBook Pro M5), using local models, with one hosted model added in a follow-up:

- **Agent:** OpenCode 2.0.30.
- **Tiers:** `small` is Gemma 4 E2B; `medium` is Qwen 3.6 35B with thinking off; `large` is the same Qwen model with thinking on.
- **Decision model:** Kev-4B (`jaredpalmer/kev-4b@v1.0`), a community System One model on Qwen 3.5 4B, served locally over MLX. It copies the API of TypeSafe's Jev.
- **Follow-up:** Jev itself (`jev-1.13`), the hosted original, reached through a third-party reseller.
- **Baselines:** an embedding nearest-neighbour router (EmbeddingGemma) and a small general LLM asked for a JSON answer (Gemma 4 E2B).

A plugin routes every user turn, applies a confidence fallback, switches the model before the turn runs, and logs each decision. Everything here is reproducible from the repository. The running log of findings is in [`notes/LEARNINGS.md`](notes/LEARNINGS.md), and each figure below cites its source in [`results/`](results/).

## What worked

**The mechanics are easy.** OpenCode's v2 plugin API lets a plugin change the model, and the reasoning variant, when a user message arrives, and the change applies to that same turn. The switch itself took 5 ms ([`notes/spike-switch.md`](notes/spike-switch.md)). Sub-agents are routed on their own. A hand-picked model pauses routing. If the decision server is down, turns proceed on the current tier. The plumbing for automatic selection already exists in agents built for manual selection.

**Routing is cheap in time once warm.** Over 39 cases (21 single prompts and an 18-turn session), Kev's median routing latency was 131 ms (p95 383 ms). Gemma's was 140 ms, and the embedding router's 84 ms ([`results/2026-10-18-615db61`](results/2026-10-18-615db61/report.md)). That is small next to any real turn on the medium or large tier.

**Kev chose sensibly.** It proposed the labelled tier for 30 of 39 cases (77%, 95% interval 62–87%): 18 of 21 single prompts and 12 of 18 session turns. Its errors were almost all between `small` and `medium`. It recognised 9 of 10 `large` cases. In a live OpenCode session, it sent a two-sentence question to `small`, a careful edge-case analysis to `large`, and a one-word follow-up back to `small` ([`results/2026-10-18-live`](results/2026-10-18-live/README.md)).

## What did not work, or not as expected

**A small general model did just as well.** Gemma 4 E2B, a 2B-class general model with thinking off, proposed the labelled tier for 29 of 39 cases (74%, interval 59–85%), and 13 of 18 session turns. The difference from Kev is well inside the noise. On this evidence, a purpose-built System One model gave no measurable accuracy advantage over a general small model running on the same machine. Kev's real advantage is a probability distribution over the choices. Gemma's self-reported confidence never fell below 0.9, so it cannot drive a fallback at all. The two also fail differently: Gemma sent 5 of 13 `medium` cases to `small`, handing real coding work to the weakest model. Kev's errors were split, so more of them wasted compute rather than risking quality.

**The first embedding baseline was a flawed test.** As built, it embedded the whole routing state: the latest message, the current tier, the recent tools and the earlier turns, as one structured block. It then compared that block with 30 bare example prompts of 8 to 16 words. Long, structured text was being compared with short prompts. The longest examples are the `large` ones, and the router proposed `large` for 30 of 39 cases, agreeing with the labels on only 15 (38%).

Rerun on the latest message alone, which is how embedding routers are usually used and matches the examples, it agreed on 30 of 39 (77%, interval 62–87%). That ties with Kev and Gemma: in paired tests, each router won 6 or 7 cases from the other. Jev still beat it, 8 cases to 1 (p = 0.04). Its errors were mostly short small tasks sent to `medium`, and it recognised all 10 `large` cases ([`results/2026-10-18-embedding-latest-ac57158`](results/2026-10-18-embedding-latest-ac57158/README.md)). On clear-cut requests, a few dozen labelled examples and a local embedding model routed as well as the small local models.

**The safety net nearly disabled the router.** The planned fallback, "if confidence is below 0.4, use `medium`", caught 72% of Kev's decisions. On the session, the tier never changed: applied agreement fell to 56%, against 74% for Kev's raw proposals ([`results/2026-10-18-ad716c3`](results/2026-10-18-ad716c3/report.md)). Kev's median confidence was 0.25, because it rescales probability from chance, so a confident-looking 0.6 probability reports as about 0.4. The threshold is now 0.1, set from the sweep. Nothing failed visibly; only the decision log's reason codes showed the problem.

**Hysteresis did not pay.** Requiring a margin before switching cut Kev's switches on the session from 7 to 5, but lowered agreement from 11/18 to 9/18 (the 0.1-threshold run). The switch it most often prevented costs almost nothing (see below), so the margin now defaults to 0.

**Kev is not deterministic.** Two runs on identical inputs gave 29 and then 30 correct proposals; its server samples at a temperature of 2.41. With confidences around 0.2, borderline decisions are close to a coin toss.

## Follow-up: the hosted original

Kev is a small open copy of TypeSafe's System One API, which raises the question of whether the hosted original does better. A follow-up therefore ran Jev itself, three times, over the same 39 cases and labels. The scoring code and configuration were identical to the earlier runs ([`results/2026-10-18-jev-51a31cf`](results/2026-10-18-jev-51a31cf/README.md)).

| Router | All 39 cases | Single prompts | Session turns |
|---|---|---|---|
| Jev (hosted) | 37/39 (95%, interval 83–99%) | 20/21 | 17/18 |
| Kev (local) | 30/39 (77%, 62–87%); 29/39 in another run | 18/21 | 12/18 |
| Gemma 4 E2B (local) | 29/39 (74%, 59–85%) | 16/21 | 13/18 |
| Embedding, latest message only (local) | 30/39 (77%, 62–87%) | 18/21 | 12/18 |
| Embedding, full state (local, original) | 15/39 (38%, 25–54%) | 11/21 | 4/18 |

**Jev was clearly better than the small general model, and probably better than Kev.** Every router saw the same cases, so the comparison can be paired:
- **Against Gemma:** Jev was right on 8 cases Gemma missed, and on none the other way round. An exact McNemar test gives p = 0.008.
- **Against Kev:** 9 cases against 2, or 10 against 2, depending on which Kev run is compared (p = 0.07 and 0.04). The direction is consistent, but the sample is too small to call it firmly.

The earlier conclusion that a System One model offered no advantage over a general small model was a finding about Kev, not about the approach.

**Its two misses were both near the edge:**
- **A large task sent to small.** It routed the stale-cache puzzle ("results stay stale for an hour, yet the TTL is five minutes") to `small`.
- **A follow-up sent to large.** It routed "Try making the log writes sequential" to `large`. That message comes in the middle of an unresolved flaky-test investigation, so arguably it inherited that task's difficulty.

**Jev was decisive and repeatable:**
- **Confidence.** It uses the same chance-rescaled scale as Kev, with a median of 0.95 against Kev's 0.25. All 31 cases at 0.8 or above were right, and both misses fell between 0.6 and 0.8.
- **The threshold trap was Kev's.** The 0.4 threshold that disabled Kev would have changed one of Jev's decisions.
- **Repeatability.** All three runs made the same choice on every case, with probabilities varying by at most 0.09.
- **Switching.** In the session it switched tiers 10 times in 18 turns, and applied the right tier on 17.

**The costs are different in kind:**
- **Latency.** The median was 356 ms and the p95 1.2 s, against 84–140 ms locally. This includes the network round trip and the reseller, and is still small next to a real turn.
- **Money.** The responses reported $0.0025 per run of 39 cases, at $0.084 per million input tokens. The account balance fell by about $0.013 across all three runs plus test calls, more than the per-call figures add up to. Either way it is fractions of a cent per session.
- **Privacy and dependency.** The session text leaves the machine, and a third party sits in the path. The response reports TypeSafe as the provider, but it could not be confirmed that the reseller passes requests on unchanged.

## What was harder than expected

**The host agent, not the decision.** `opencode run` stalled before creating a session on roughly every other invocation, and the repository works around this with a retry watchdog. In the live session, those retries re-sent one prompt twice. The plugin documentation describes an older API than the one that makes this possible. Plugins have no clean channel to tell the user "switched to large because…", and OpenCode makes model calls you did not choose: with the user's normal configuration, session titles went to a hosted OpenAI model while every turn ran locally.

**Cold starts.** Local models are loaded and evicted on demand. In the first full run, the embedding router failed every call, because loading it took longer than the timeout and each abandoned request left it unloaded. The fix was generous timeouts and a warm-up.

**Labels.** Deciding the "right" tier is a judgement call, and some requests have no single answer. To avoid individual judgement calls, the experiment agent drafted the prompts, the session and their labels to sit clearly in one tier, and borderline drafts were discarded. The same agent also wrote the tier descriptions the routers receive. This makes every agreement figure here, including Jev's 95%, a best case for clear requests. The grey zone that real use contains is not measured.

## Switching costs

The cost of a switch is mostly the time spent re-reading the conversation. The benchmark measured time to first token after each kind of change, as the median of three runs at 2k and 8k tokens of context ([`results/2026-10-18-switch-cost`](results/2026-10-18-switch-cost/switch-cost.md)).

| Change | 2k context | 8k context | Context re-read? |
|---|---|---|---|
| No change (Qwen 3.6) | 43 ms | 44 ms | no |
| Qwen 3.6 thinking on or off (`medium` and `large`) | 37 ms | 39 ms | no |
| gpt-oss effort low to high | 1.8 s | 7.8 s | yes |
| Gemma to Qwen 3.6, both loaded (`small` to `medium`) | 1.9 s | 9.4 s | yes |
| Gemma to Qwen 3.6, Qwen not loaded | 8.3 s | 15.7 s | yes, plus about 6 s loading |
| Qwen 3.6 35B to Qwen 3.8 27B, same family | 16.5 s | 78 s | yes |

Three findings follow:

- **Changing the reasoning level can be free or not, depending on the model's template.** Qwen's thinking switch sits at the end of the prompt, so the cached conversation is reused. gpt-oss writes its effort level at the top, so changing it forces a full re-read. Nothing in the user interface reveals the difference.
- **A model from the same family shares nothing.** The cache belongs to the weights, so moving between two Qwen models costs as much as moving between families.
- **Model architecture matters more than family.** The 27B dense Qwen 3.8 re-read 8k tokens in 78 s, against about 9 s for the 35B mixture-of-experts Qwen 3.6.

Costs also grow faster than the context: from 2k to 8k, a four-fold increase, the Gemma-to-Qwen switch became five times slower. In the shipped menu, `medium` to `large` is the cheap switch and anything to or from `small` is the expensive one. On a long session, a router that drops to `small` for a quick question pays several seconds to come back. A 32k measurement was left out for time. Some re-read shares exceed 100% because the cold reference was measured separately and timings vary.

## Can a router follow the conversation?

One argument for System One routers is that an embedding of a single request cannot follow a conversation. A follow-up such as "now fix it" carries no sign of how hard the task behind it is.

The session was checked for this. Five turns refer back to earlier work that sets their difficulty:
- "Write a unit test for the new option."
- "Fix the failing test."
- "Try making the log writes sequential."
- "It's still failing … step back and reason…"
- "Implement the rotation as designed."

Agreement on those five turns:

| Router | Correct |
|---|---|
| Kev | 5/5 |
| Jev | 4/5 |
| Embedding, latest message only | 4/5 |
| Gemma | 2/5 |
| Embedding, full state | 2/5 |

So the latest-message embedding did not fail on them. Each of these follow-ups says in its own words roughly how hard it is: "step back and reason" nearly repeats one of the `large` examples. The session was written so every turn sits clearly in one tier, and so it contains no follow-up whose wording gives nothing away.

With five turns the intervals span 38–96%. This evidence neither supports nor refutes the argument. Testing it needs real sessions with terse follow-ups.

## Kev's context limit, and what was not tested

Kev must read its whole input on every turn, and its server reuses work only for byte-identical inputs. On this laptop, that costs about 0.8 ms per token of session state: roughly 1.6 s at 2k tokens and 6.5 s at the 8k cap, against Kev's own figures of tens of milliseconds on datacentre GPUs ([`notes/spike-kev.md`](notes/spike-kev.md)). Local System One routing is fast for short states and noticeably slow for long ones.

The evaluation did not reach that regime. The scripted session's states were about 490 tokens, so the sweep over 2k–16k budgets gave identical results at every size. Whether more history helps routing, and how a router behaves near Kev's 8k validated context, remain open. One live observation points both ways: after a hard deadlock discussion, Kev proposed `large` even for "Reply with just: one". Context makes "now fix it" inherit a task's difficulty, but a trivial aside inherits it too.

Memory is the other limit. Kev, Gemma and Qwen together took about 37 GB in steady use, peaking near 45 GB while Kev loads. That fits a well-specified laptop, with little room for more models on the menu.

## Does this support the thesis?

Partly.

- **Mechanically, yes.** An agent can choose its own model per turn, including the reasoning level, with about a thousand lines of plugin and routing code and well under a second of routing time on short states. A simple question went to a 2B model and a hard one to a thinking model, without the user doing anything.
- **On accuracy, it depends on the decision model.** The local options agreed with clear-cut labels about three times in four, and none beat the others. That holds for Kev, a 4B open copy, a general 2B model, and an embedding lookup over 30 examples, once the lookup compared like with like. Hosted Jev agreed 37 times in 39, clearly better than the general model and probably better than Kev. The sample is 39 clear cases, so even Jev's figure has an interval of 83–99%. With Kev, the most consequential setting was the fallback threshold. It had to be tuned from data, or it quietly turned automatic selection into "always medium".
- **Economically, it depends on the menu.** Where the tiers share weights and the reasoning toggle sits at the end of the prompt, as with Qwen here, switching is nearly free and routing pays off. Where tiers are different models, each switch re-reads the whole context. That favours staying put and penalises a router that flips often.

A fair conclusion for this proof of concept: automatic selection is practical now. A strong decision model makes it accurate on clear requests, for a fraction of a cent and a few hundred milliseconds per turn. The trade-off is that the session text leaves the machine. A small local model is free and private, but makes noticeably more mistakes.

The remaining obstacles are the host agent's support, the price of switching, and the absence of good labels for the ambiguous middle. Those are engineering and evaluation problems rather than research ones, which is itself an argument that manual selection will not last.

## Limits of this evidence

- **Sample size.** 21 prompts and one 18-turn scripted session. The prompts and labels were drafted by the experiment agent to be unambiguous, with borderline drafts discarded.
- **Short states.** No long real sessions, so long context is untested.
- **Specific choices.** One laptop, one agent version, two System One models and an illustrative three-tier menu.
- **A reseller in the path.** Jev was reached through a third party. It could not be confirmed that requests reach TypeSafe unchanged, and the latency figures include the reseller.
- **Costs.** The local models cost time, not money. Jev's money cost is the reseller's price, not TypeSafe's list price.

Read every figure with its interval. The repository includes everything needed to rerun the experiment with your own labels.
