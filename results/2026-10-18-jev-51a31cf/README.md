# Hosted Jev: routing evaluation

TypeSafe's hosted Jev was run three times over the same 39 cases as the other routers: 21 single prompts and the 18-turn session, with the same labels. Each run directory (`run-1`, `run-2`, `run-3`) holds the standard `report.md`, `report.json` and `decisions.jsonl`.

## Like-for-like conditions

- **Code:** commit `51a31cf`. Its scoring code (`src/eval/evaluate.ts`, `stats.ts`, `dataset.ts`, and `src/core/policy.ts`, `state.ts`, `route.ts`) is unchanged from `615db61`, the commit behind the other routers' results. The changes since then:
  - the Jev router itself;
  - an optional bearer key and request path in the System One client;
  - use of a service-reported cost when one is given;
  - repository-relative paths in report metadata.
- **Configuration:** the configuration at `615db61` (threshold 0.1, margin 0.15, state budget 8,192 tokens, default tier `medium`), plus the Jev section. The live default margin has since changed to 0, so it was not used here.
- **Prompts:** the same tier descriptions, question and state construction as Kev.
- **Not run:** the state-size sweep. It was uninformative for Kev because the session's states are short, and it is out of scope here.

## Access

- **Route:** Jev was reached through a third-party reseller's API, which takes TypeSafe's System One request body at its own path.
- **Model:** the request named `typesafe/jev-1.13`. Every response reported model `typesafe/jev-1.13-20260917` and provider `TypeSafe`.
- **Caveat:** it could not be confirmed that the reseller passes requests to TypeSafe unchanged.
- **Data:** only the evaluation prompts and the session left the machine.

## Results

Agreement here means the proposed tier against the label. The other routers' figures come from [`../2026-10-18-615db61`](../2026-10-18-615db61/report.md), and Kev's second figure from [`../2026-10-18-ad716c3`](../2026-10-18-ad716c3/report.md).

| Router | All 39 (95% CI) | Single prompts | Session turns |
|---|---|---|---|
| **Jev** (all three runs) | **37/39 (95%, 83–99%)** | **20/21** | **17/18** |
| Kev | 30/39 (77%, 62–87%); 29/39 in its other run | 18/21 | 12/18 |
| Gemma 4 E2B | 29/39 (74%, 59–85%) | 16/21 | 13/18 |
| Embedding | 15/39 (38%, 25–54%) | 11/21 | 4/18 |

**Paired comparison.** Every router saw the same cases, so the differences were also tested pairwise with an exact McNemar test:
- **Against Gemma:** Jev was right on 8 cases Gemma missed, and on none the other way round (p = 0.008).
- **Against Kev:** 9 against 2 (p = 0.07) for the `615db61` run, and 10 against 2 (p = 0.04) for the `ad716c3` run.

The session turns are not byte-identical between routers. Each router's applied tier is carried forward as the current tier, so the state differs slightly from turn to turn.

**Confusion matrix** (rows are labels, columns are Jev's proposal; identical in all runs):

| label \ chosen | small | medium | large |
|---|---|---|---|
| small | 16 | 0 | 0 |
| medium | 0 | 12 | 1 |
| large | 1 | 0 | 9 |

**The two misses:**
- **p16** ("Search results can stay stale for up to an hour…", labelled `large`) went to `small`, with probabilities small 0.74, medium 0.07 and large 0.19, and confidence 0.61.
- **Session turn 10** ("Try making the log writes sequential.", labelled `medium`) went to `large`, with probabilities small 0.01, medium 0.13 and large 0.86, and confidence 0.79. It comes in the middle of an unresolved flaky-test investigation, so it inherits that difficulty. The label was not changed.

**Spread.** All three runs made the same choice on every case. Probabilities varied by at most 0.09 between runs. No temperature or seed setting is documented.

**Confidence.** Jev uses the same chance-rescaled scale as Kev, `(p_max − 1/3) / (2/3)`, so it reads zero for an even split and one for certainty. Its distribution in run 1 was minimum 0.38, lower quartile 0.86, median 0.95, upper quartile 0.98, maximum 1.00. Kev's median was 0.25.

**Does low confidence predict errors?** Partly:
- All 31 cases at 0.8 or above were right.
- Both errors fell between 0.6 and 0.8, a band where 3 of 5 were right.
- The 3 cases below 0.6 were all right.

**Threshold sweep.** Agreement stays at 37/39 up to a threshold of 0.5, then falls, to 35/39 at 0.9. From 0.8 upwards, falling back to `medium` corrects session turn 10, but it breaks more correct answers than that. The 0.4 threshold that disabled Kev would have changed one Jev decision.

**Session behaviour.** 17 of 18 turns were applied correctly, with 10 switches both with and without hysteresis.

## Latency and cost

- **Latency:** median 356 ms and p95 1,166 ms over all 117 decisions in the three runs. This includes the network round trip and the reseller in the path, so it is not comparable with the local routers' 84–140 ms.
- **Billing:** the reseller charges for input tokens only, at $0.084 per million. Each response carries its own `usage.cost`.
- **Reported cost:** each run used 30,248 input tokens, and the responses reported $0.0025 per run. Jev counted about twice as many input tokens as Kev's 15,744 for the same states.
- **Account balance:** the balance fell by $0.0127 across everything, which also includes a handful of format test calls and three unrecorded warm-up calls. That is about $0.005 more than the per-call costs add up to. The balance was still falling a few minutes after the runs, so charges may settle late. The total stayed well inside the 20-cent budget.
