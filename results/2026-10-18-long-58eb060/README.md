# Long prompts and terse follow-ups

This is the last round of the experiment. It tests the cases where embedding routers were expected to struggle: long prompts, and terse follow-ups whose wording gives nothing away. The prediction, stated before running: on these cases, the embedding routers would do clearly worse than Jev, and probably worse than Kev and Gemma.

## The cases

The cases are in `data/eval-long/`, separate from the original 39. They were written and labelled before any router ran, and committed in `58eb060`. The overlap check against the router examples passed.

**Eight long single prompts** (3 small, 3 medium, 2 large). Each pairs a block of material with a request whose difficulty does not follow from the material. The material is about 2,100 to 3,300 estimated tokens: this repository's own files, plus one generated service log (`scripts/build-long-prompts.mjs`). The request comes at the start of four prompts and at the end of the other four.

| Case | Material | Request | Position | Label |
|---|---|---|---|---|
| lp1 | Service log | "What time was the first error in this log?" | end | small |
| lp2 | `LICENSE` | "What licence is this? One word is fine." | start | small |
| lp3 | `src/core/config.ts` | "Which function … checks that a number is within its allowed range?" | start | small |
| lp4 | `state.ts` and its tests | "Add an option to cap how many earlier turns are kept … and a unit test" | end | medium |
| lp5 | `src/eval/report.ts` | "Add a fallback-rate column to the summary table … and update the report test" | start | medium |
| lp6 | `README.md` | "Add a section … on running the evaluation with your own labelled prompts" | end | medium |
| lp7 | The design document | "Find the flaw in this design." | end | large |
| lp8 | `log.ts` and `selector.ts` | "Two OpenCode processes can write to the same decision log … propose a fix that holds" | start | large |

**One seven-turn session** (`terse-follow-ups`). Turns 2, 4, 6 and 7 are terse follow-ups whose tier follows from the earlier turns, under the tier definitions:

| Turn | Message | Label | Why |
|---|---|---|---|
| 1 | "Why does npm run build print \"Unknown option --minfy\"?" | small | Factual question |
| **2** | **"now fix it"** | small | A one-line fix to the typo found in turn 1 |
| 3 | "Convert GET /orders to use the new paginate() helper…" | medium | A well-specified change |
| **4** | **"do the same for the rest"** | medium | Continuing a task already under way, across eleven endpoints |
| 5 | "…the nightly export sometimes misses a few orders, but only when it overlaps the cleanup job…" | large | An intermittent bug |
| **6** | **"still missing some"** | large | The previous attempt failed |
| **7** | **"try the other approach"** | large | The previous attempt failed |

## Runs and conditions

- **Routers:** every router ran on the new cases only: Jev, Kev (twice), Gemma, and both embedding variants.
- **Code and configuration:** commit `58eb060`, with the configuration at `615db61` (threshold 0.1, margin 0.15). The scoring code (`src/eval/evaluate.ts`, `stats.ts`, `dataset.ts`, `src/core/policy.ts`, `state.ts` and `llm.ts`) is unchanged from `615db61`. Only the router additions differ.
- **Files:** `kev-gemma-embedding-state/` holds Kev's first run, Gemma and the full-state embedding. `kev-run-2/`, `embedding-latest/` and `jev/` hold one run each.
- **Kev's two runs** were identical in every choice.
- **Jev cost:** the responses reported $0.0027 for its run, and the account balance fell by $0.0032.

## Context limits and truncation

- **State builder:** the latest message is clipped only if the whole state exceeds the 8,192-token budget. No case did, so Kev, Jev and Gemma saw every prompt in full.
  - Kev read up to 6,405 tokens, inside its 8k validated context.
  - Jev read up to 6,764 tokens, inside its 64k context.
  - Gemma read up to 6,765 tokens; Ollama ran it with a 131,072-token context.
- **EmbeddingGemma** reads 2,048 tokens and cuts the rest from the end. It truncated all eight long prompts, in both variants. In the four prompts with the request at the end (lp1, lp4, lp6 and lp7), the material before the request already fills the window, so the embedding never contains the request at all. This was recorded, not worked around.

## Results

Each figure is the proposed tier against the label, with a Wilson 95% interval. These figures are for the new cases only; the original 39 are reported separately.

| Router | Long prompts (8) | Session (7) | Terse follow-ups (4) | All new (15) |
|---|---|---|---|---|
| Jev | 8/8 (100%, 68–100%) | 7/7 (100%, 65–100%) | 4/4 | 15/15 (100%, 80–100%) |
| Gemma 4 E2B | 5/8 (63%, 31–86%) | 7/7 (100%, 65–100%) | 4/4 | 12/15 (80%, 55–93%) |
| Kev (both runs) | 4/8 (50%, 22–78%) | 5/7 (71%, 36–92%) | 2/4 | 9/15 (60%, 36–80%) |
| Embedding, latest message | 4/8 (50%, 22–78%) | 4/7 (57%, 25–84%) | 2/4 | 8/15 (53%, 30–75%) |
| Embedding, full state | 4/8 (50%, 22–78%) | 3/7 (43%, 16–75%) | 1/4 | 7/15 (47%, 25–70%) |

**Each router's proposal per case** (an asterisk marks a miss; confidence in brackets):

| Case | Label | Jev | Kev | Gemma | Emb. latest | Emb. state |
|---|---|---|---|---|---|---|
| lp1 (end) | small | small (1.00) | small (0.17) | small (1.00) | *large (0.71) | *large (0.72) |
| lp2 (start) | small | small (1.00) | small (0.73) | small (1.00) | small (0.70) | *large (0.40) |
| lp3 (start) | small | small (1.00) | *medium (0.12) | small (0.95) | *medium (0.40) | small (0.10) |
| lp4 (end) | medium | medium (0.95) | medium (0.26) | *small (0.95) | *large (0.70) | *large (0.70) |
| lp5 (start) | medium | medium (0.95) | medium (0.04) | medium (0.95) | medium (0.41) | medium (0.40) |
| lp6 (end) | medium | medium (0.40) | *small (0.17) | *small (0.95) | *large (0.39) | *large (0.39) |
| lp7 (end) | large | large (0.59) | *medium (0.18) | large (0.95) | large (0.70) | large (0.71) |
| lp8 (start) | large | large (0.56) | *medium (0.33) | *medium (0.95) | large (0.70) | large (0.70) |
| turn 1 | small | small | small | small | *medium | *large |
| **turn 2** "now fix it" | small | small | small | small | *large | *large |
| turn 3 | medium | medium | medium | medium | medium | medium |
| **turn 4** "do the same for the rest" | medium | medium | medium | medium | *large | *large |
| turn 5 | large | large | large | large | large | large |
| **turn 6** "still missing some" | large | large | *medium | large | large | *medium |
| **turn 7** "try the other approach" | large | large | *medium | large | large | large |

**Confusion matrices** (rows are labels; columns are small / medium / large):

| Router | small | medium | large |
|---|---|---|---|
| Jev | 5 / 0 / 0 | 0 / 5 / 0 | 0 / 0 / 5 |
| Gemma | 5 / 0 / 0 | 2 / 3 / 0 | 0 / 1 / 4 |
| Kev | 4 / 1 / 0 | 1 / 4 / 0 | 0 / 4 / 1 |
| Embedding, latest | 1 / 2 / 2 | 0 / 2 / 3 | 0 / 0 / 5 |
| Embedding, state | 1 / 0 / 4 | 0 / 2 / 3 | 0 / 1 / 4 |

**Paired comparisons with Jev** (exact McNemar test, same 15 cases):

| Router | Only Jev right | Only the other right | p |
|---|---|---|---|
| Embedding, full state | 8 | 0 | 0.008 |
| Embedding, latest | 7 | 0 | 0.016 |
| Kev | 6 | 0 | 0.031 |
| Gemma | 3 | 0 | 0.25 |

The latest-message embedding against Kev was 4 against 5 (p = 1.0), and against Gemma 1 against 5 (p = 0.22).

## What the per-case results show

- **The embeddings cannot see a request at the end of a long prompt.** Where the request came at the end, the latest-message variant got 1 of 4 right. That was lp7, a design document, which reads as `large` regardless of the request. Where it came at the start, it got 3 of 4.
- **The latest-message embedding cannot tell terse follow-ups apart.** It proposed `large` for all four, whose labels are small, medium, large and large. Its 2 of 4 is what always answering `large` would score.
- **Kev under-routed long prompts.** It sent both long `large` prompts to `medium`, with confidence of 0.33 or below everywhere except lp2.
- **Kev's two terse misses followed a hysteresis hold.** At turn 5 Kev proposed `large`, but the 0.15 margin kept `medium`. At turns 6 and 7 its state said the current tier was `medium`, and it proposed `medium`. In the state-size sweep, which supplies the previous turn's label as the current tier instead, Kev got all 7 session turns right. Kev appears to anchor on the `current_tier` it is given. The live default margin is now 0, which this run did not use.
- **Gemma handled the conversation but not all the long prompts.** It got every session turn right, including all four terse follow-ups. It sent two long medium prompts to `small` and one long large prompt to `medium`, all at a reported confidence of 0.95.

## Did the prediction hold?

- **Against Jev, yes.** Both embedding variants did clearly worse (paired p = 0.016 and 0.008).
- **Against Gemma, in direction only.** The embeddings scored 8/15 and 7/15 against Gemma's 12/15, but the paired difference is not significant on 15 cases.
- **Against Kev, no.** Kev also dropped, to 9/15, and the latest-message embedding matched it (4 cases against 5).
- **On the two cases the prediction named,** the embeddings failed in the predicted way. They could not see requests at the end of long prompts, and could not tell terse follow-ups apart.

## Latency

These are median routing latencies over the main-run decisions:

| Router | Median |
|---|---|
| Embedding | about 150 ms |
| Jev | 360 ms (including the network and the reseller) |
| Kev | about 800 ms (long inputs) |
| Gemma | about 850 ms (long inputs) |
