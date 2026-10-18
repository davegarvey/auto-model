# Routing evaluation

Run 2026-10-18T12:30:15.776Z at commit `a91a874`, dataset revision `a91a874`: 21 prompts, 1 sessions (18 turns).
Threshold 0.4, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| systemone | 29/39 (74%, 95% CI 59%–85%) | 18/21 (86%, 95% CI 65%–95%) | 11/18 (61%, 95% CI 39%–80%) | 22/39 (56%, 95% CI 41%–71%) | 140 ms | 407 ms |
| embedding | 15/39 (38%, 95% CI 25%–54%) | 11/21 (52%, 95% CI 32%–72%) | 4/18 (22%, 95% CI 9%–45%) | 19/39 (49%, 95% CI 34%–64%) | 89 ms | 132 ms |
| llm | 28/39 (72%, 95% CI 56%–83%) | 16/21 (76%, 95% CI 55%–89%) | 12/18 (67%, 95% CI 44%–84%) | 28/39 (72%, 95% CI 56%–83%) | 171 ms | 275 ms |

## State-size sweep (systemone, multi-turn turns)

| budget (tokens) | agreement | median latency | median state tokens | turns truncated |
|---|---|---|---|---|
| 2048 | 13/18 (72%, 95% CI 49%–88%) | 237 ms | 490 | 0 |
| 4096 | 13/18 (72%, 95% CI 49%–88%) | 238 ms | 490 | 0 |
| 8192 | 13/18 (72%, 95% CI 49%–88%) | 238 ms | 490 | 0 |
| 16384 | 13/18 (72%, 95% CI 49%–88%) | 241 ms | 490 | 0 |

## Routers

### systemone (kev-latest)

- Proposed tier vs label, all cases: 29/39 (74%, 95% CI 59%–85%)
- Single prompts: 18/21 (86%, 95% CI 65%–95%); multi-turn turns: 11/18 (61%, 95% CI 39%–80%)
- Applied tier (threshold and hysteresis as configured) vs label: 22/39 (56%, 95% CI 41%–71%)
- Routing latency: median 140 ms, p95 407 ms
- Routing tokens: 15744 in, 2442 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 10 | 6 | 0 | 0 |
| medium | 3 | 10 | 0 | 0 |
| large | 0 | 1 | 9 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.1 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.2 | 27/39 (69%, 95% CI 54%–81%) | 36% |
| 0.3 | 25/39 (64%, 95% CI 48%–77%) | 59% |
| 0.4 | 22/39 (56%, 95% CI 41%–71%) | 72% |
| 0.5 | 19/39 (49%, 95% CI 34%–64%) | 82% |
| 0.6 | 15/39 (38%, 95% CI 25%–54%) | 95% |
| 0.7 | 13/39 (33%, 95% CI 21%–49%) | 100% |
| 0.8 | 13/39 (33%, 95% CI 21%–49%) | 100% |
| 0.9 | 13/39 (33%, 95% CI 21%–49%) | 100% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 6/18 (33%, 95% CI 16%–56%) | 0 | 6/18 (33%, 95% CI 16%–56%) | 0 |

### embedding (embeddinggemma)

- Proposed tier vs label, all cases: 15/39 (38%, 95% CI 25%–54%)
- Single prompts: 11/21 (52%, 95% CI 32%–72%); multi-turn turns: 4/18 (22%, 95% CI 9%–45%)
- Applied tier (threshold and hysteresis as configured) vs label: 19/39 (49%, 95% CI 34%–64%)
- Routing latency: median 89 ms, p95 132 ms
- Routing tokens: 7369 in, 0 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 3 | 3 | 10 | 0 |
| medium | 1 | 2 | 10 | 0 |
| large | 0 | 0 | 10 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 15/39 (38%, 95% CI 25%–54%) | 0% |
| 0.1 | 15/39 (38%, 95% CI 25%–54%) | 0% |
| 0.2 | 16/39 (41%, 95% CI 27%–57%) | 13% |
| 0.3 | 16/39 (41%, 95% CI 27%–57%) | 13% |
| 0.4 | 19/39 (49%, 95% CI 34%–64%) | 31% |
| 0.5 | 17/39 (44%, 95% CI 29%–59%) | 51% |
| 0.6 | 17/39 (44%, 95% CI 29%–59%) | 51% |
| 0.7 | 19/39 (49%, 95% CI 34%–64%) | 64% |
| 0.8 | 17/39 (44%, 95% CI 29%–59%) | 85% |
| 0.9 | 17/39 (44%, 95% CI 29%–59%) | 85% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 6/18 (33%, 95% CI 16%–56%) | 2 | 6/18 (33%, 95% CI 16%–56%) | 2 |

### llm (gemma4:e2b-mlx)

- Proposed tier vs label, all cases: 28/39 (72%, 95% CI 56%–83%)
- Single prompts: 16/21 (76%, 95% CI 55%–89%); multi-turn turns: 12/18 (67%, 95% CI 44%–84%)
- Applied tier (threshold and hysteresis as configured) vs label: 28/39 (72%, 95% CI 56%–83%)
- Routing latency: median 171 ms, p95 275 ms
- Routing tokens: 17524 in, 778 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 15 | 1 | 0 | 0 |
| medium | 5 | 5 | 3 | 0 |
| large | 1 | 1 | 8 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.1 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.2 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.3 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.4 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.5 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.6 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.7 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.8 | 28/39 (72%, 95% CI 56%–83%) | 0% |
| 0.9 | 28/39 (72%, 95% CI 56%–83%) | 0% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 12/18 (67%, 95% CI 44%–84%) | 7 | 12/18 (67%, 95% CI 44%–84%) | 7 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
- System One server: `{"name":"kev-latest","description":"Kev pointer head on Qwen/Qwen3.5-4B-Base, serving jaredpalmer/kev-4b@v1.0 at temperature 2.41","release_date":"2026-10-01","run":"jaredpalmer/kev-4b@v1.0","base":"Qwen/Qwen3.5-4B-Base","lora":16,"device":"mps","backend":"mlx","dtype":"bfloat16","temperature":2.406`
