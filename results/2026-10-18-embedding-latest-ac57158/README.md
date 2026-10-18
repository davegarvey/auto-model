# Embedding baseline, latest message only

The embedding router was rerun with `embedding.input` set to `latest`, so it embeds only the message being routed, with the same `task: classification | query: ` prefix as its examples. Everything else matches the original baseline:
- the same 30 examples;
- the same embedding model (`embeddinggemma`, digest `85462619ee72`, as in the original run);
- k = 5;
- the same 39 cases and labels.

`run-1` is the result. `run-2` is an identical repeat used to check determinism.

## Why the original baseline was mismatched

The original baseline embedded the whole routing state. That was the latest message, the current tier, the recent tools and the earlier turns, newest first, all as one structured block. It then compared that block with 30 bare example prompts of 8 to 16 words. Long, structured text was being compared with short prompts. The longest examples are the `large` ones, which fits its bias: it proposed `large` for 30 of 39 cases. Embedding routers in practice usually embed only the request.

## Like-for-like conditions

- **Code:** commit `ac57158`. The scoring code (`src/eval/evaluate.ts`, `stats.ts`, `dataset.ts`, and `src/core/policy.ts`, `state.ts`) is unchanged from `615db61`, the commit behind the full-state results. The changes in `src/core/route.ts` since then concern cost and the Jev router only. The full-state embedding path is unchanged and remains the default.
- **Configuration:** the configuration at `615db61` (threshold 0.1, margin 0.15), with `embedding.input` set to `latest`.
- **Determinism:** the second full run matched the first exactly: the same choices and identical scores. The same message embedded twice gave an identical 768-dimensional vector.

## Results

Each figure is the proposed tier against the label, with a Wilson 95% interval. The figures for the other routers are taken from [`../2026-10-18-615db61`](../2026-10-18-615db61/report.md) and [`../2026-10-18-jev-51a31cf`](../2026-10-18-jev-51a31cf/README.md).

| Router | All 39 | Single prompts (21) | Session turns (18) | Proposals small / medium / large |
|---|---|---|---|---|
| Embedding, latest message only | 30/39 (77%, 62–87%) | 18/21 (86%, 65–95%) | 12/18 (67%, 44–84%) | 10 / 18 / 11 |
| Embedding, full state (original) | 15/39 (38%, 25–54%) | 11/21 (52%, 32–72%) | 4/18 (22%, 9–45%) | 4 / 5 / 30 |
| Jev | 37/39 (95%, 83–99%) | 20/21 | 17/18 | 17 / 12 / 10 |
| Kev | 30/39 (77%, 62–87%) | 18/21 | 12/18 | 16 / 14 / 9 |
| Gemma 4 E2B | 29/39 (74%, 59–85%) | 16/21 | 13/18 | 21 / 8 / 10 |

The labels contain 16 small, 13 medium and 10 large cases.

**Paired comparisons** (exact McNemar test, same cases) for the latest-message variant against each other router:

| Compared with | Only latest-message right | Only the other right | p |
|---|---|---|---|
| Full-state embedding | 16 | 1 | 0.0003 |
| Kev | 7 | 7 | 1.0 |
| Gemma | 7 | 6 | 1.0 |
| Jev | 1 | 8 | 0.04 |

**Confusion matrices** (rows are labels, columns are proposals):

| Latest message only | small | medium | large |
|---|---|---|---|
| small | 9 | 7 | 0 |
| medium | 1 | 11 | 1 |
| large | 0 | 0 | 10 |

| Full state (original) | small | medium | large |
|---|---|---|---|
| small | 3 | 3 | 10 |
| medium | 1 | 2 | 10 |
| large | 0 | 0 | 10 |

**The latest-message variant's errors are mostly small tasks sent to medium** (7 of 16). They are short requests such as:
- "Run the tests."
- "Which test file covers the policy?"
- "Change the default port in server.ts from 3000 to 8080."

All seven had confidence of 0.45 or below. It recognised all 10 large cases.

## Context-dependent session turns

**The rule.** A turn counts as context-dependent if it refers back to earlier work, and that earlier work, not the message itself, sets how hard the request is. Five turns meet it:

| Turn | Message | Label | Why it counts |
|---|---|---|---|
| 4 | "Write a unit test for the new option." | medium | The test's scope is the option added in turn 3 |
| 6 | "Fix the failing test." | medium | What needs fixing is the failure reported in turn 5 |
| 10 | "Try making the log writes sequential." | medium | A directed attempt within the flaky-test investigation begun in turn 9 |
| 11 | "It's still failing at the same rate, so that wasn't it. Step back and reason…" | large | Large because the previous attempt failed |
| 16 | "Implement the rotation as designed, with tests." | medium | The scope is the design produced in turn 15 |

**Turns that refer back but were not counted:**
- **Turns 7, 8 and 14** (rename the option, commit that, add a line about this): the task is small whatever came before.
- **Turn 12** ("make each test write its log to its own temporary directory"): it follows from the diagnosis, but the request is self-contained.

Agreement on these turns:

| Router | Context-dependent turns (5) | Other session turns (13) |
|---|---|---|
| Embedding, latest message only | 4/5 (80%, 38–96%) | 8/13 (62%, 36–82%) |
| Embedding, full state | 2/5 (40%, 12–77%) | 2/13 (15%, 4–42%) |
| Jev | 4/5 (80%, 38–96%) | 13/13 (100%, 77–100%) |
| Kev | 5/5 (100%, 57–100%) | 7/13 (54%, 29–77%) |
| Gemma 4 E2B | 2/5 (40%, 12–77%) | 11/13 (85%, 58–96%) |

**The latest-message variant did not fail on the context-dependent turns.** Its one miss, turn 10, it sent to `large`, as Jev and Gemma also did. Each follow-up's own wording carried its tier:
- **Turn 11:** "Step back and reason" nearly repeats example `l05`, "Your last two fixes … didn't work. Step back and reason about it from first principles."
- **Turn 6:** "Fix the failing test" resembles example `m10`.

The session was scripted so each turn sits clearly in one tier. As a side effect, the follow-ups say how hard they are. It contains no follow-up whose words give the tier nothing to go on, such as "now fix it" after a hard diagnosis, or "try again".

**These figures neither support nor refute the claim that an embedding of one request cannot follow a conversation.** Five turns give intervals spanning 38–96%, and the session does not contain the cases that would test the claim.

## Latency

The median was 77 ms and the p95 90 ms, local and warm, against 84 ms for the full-state variant.
