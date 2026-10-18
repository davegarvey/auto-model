# Routing evaluation

Run 2026-10-18T12:31:30.578Z at commit `615db61`, dataset revision `ad716c3`: 21 prompts, 1 sessions (18 turns).
Threshold 0.1, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| systemone | 30/39 (77%, 95% CI 62%–87%) | 18/21 (86%, 95% CI 65%–95%) | 12/18 (67%, 95% CI 44%–84%) | 27/39 (69%, 95% CI 54%–81%) | 131 ms | 383 ms |
| embedding | 15/39 (38%, 95% CI 25%–54%) | 11/21 (52%, 95% CI 32%–72%) | 4/18 (22%, 95% CI 9%–45%) | 15/39 (38%, 95% CI 25%–54%) | 84 ms | 94 ms |
| llm | 29/39 (74%, 95% CI 59%–85%) | 16/21 (76%, 95% CI 55%–89%) | 13/18 (72%, 95% CI 49%–88%) | 29/39 (74%, 95% CI 59%–85%) | 140 ms | 181 ms |

## State-size sweep (systemone, multi-turn turns)

| budget (tokens) | agreement | median latency | median state tokens | turns truncated |
|---|---|---|---|---|
| 2048 | 13/18 (72%, 95% CI 49%–88%) | 239 ms | 490 | 0 |
| 4096 | 13/18 (72%, 95% CI 49%–88%) | 248 ms | 490 | 0 |
| 8192 | 13/18 (72%, 95% CI 49%–88%) | 255 ms | 490 | 0 |
| 16384 | 13/18 (72%, 95% CI 49%–88%) | 264 ms | 490 | 0 |

## Routers

### systemone (kev-latest)

- Proposed tier vs label, all cases: 30/39 (77%, 95% CI 62%–87%)
- Single prompts: 18/21 (86%, 95% CI 65%–95%); multi-turn turns: 12/18 (67%, 95% CI 44%–84%)
- Applied tier (threshold and hysteresis as configured) vs label: 27/39 (69%, 95% CI 54%–81%)
- Routing latency: median 131 ms, p95 383 ms
- Routing tokens: 15744 in, 2445 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 12 | 4 | 0 | 0 |
| medium | 4 | 9 | 0 | 0 |
| large | 0 | 1 | 9 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 30/39 (77%, 95% CI 62%–87%) | 0% |
| 0.1 | 30/39 (77%, 95% CI 62%–87%) | 5% |
| 0.2 | 28/39 (72%, 95% CI 56%–83%) | 41% |
| 0.3 | 25/39 (64%, 95% CI 48%–77%) | 62% |
| 0.4 | 22/39 (56%, 95% CI 41%–71%) | 74% |
| 0.5 | 19/39 (49%, 95% CI 34%–64%) | 85% |
| 0.6 | 15/39 (38%, 95% CI 25%–54%) | 95% |
| 0.7 | 13/39 (33%, 95% CI 21%–49%) | 100% |
| 0.8 | 13/39 (33%, 95% CI 21%–49%) | 100% |
| 0.9 | 13/39 (33%, 95% CI 21%–49%) | 100% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 9/18 (50%, 95% CI 29%–71%) | 5 | 11/18 (61%, 95% CI 39%–80%) | 7 |

### embedding (embeddinggemma)

- Proposed tier vs label, all cases: 15/39 (38%, 95% CI 25%–54%)
- Single prompts: 11/21 (52%, 95% CI 32%–72%); multi-turn turns: 4/18 (22%, 95% CI 9%–45%)
- Applied tier (threshold and hysteresis as configured) vs label: 15/39 (38%, 95% CI 25%–54%)
- Routing latency: median 84 ms, p95 94 ms
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
| cli-option-and-flaky-test | 18 | 4/18 (22%, 95% CI 9%–45%) | 2 | 4/18 (22%, 95% CI 9%–45%) | 2 |

### llm (gemma4:e2b-mlx)

- Proposed tier vs label, all cases: 29/39 (74%, 95% CI 59%–85%)
- Single prompts: 16/21 (76%, 95% CI 55%–89%); multi-turn turns: 13/18 (72%, 95% CI 49%–88%)
- Applied tier (threshold and hysteresis as configured) vs label: 29/39 (74%, 95% CI 59%–85%)
- Routing latency: median 140 ms, p95 181 ms
- Routing tokens: 17524 in, 773 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 15 | 1 | 0 | 0 |
| medium | 5 | 6 | 2 | 0 |
| large | 1 | 1 | 8 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.1 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.2 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.3 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.4 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.5 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.6 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.7 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.8 | 29/39 (74%, 95% CI 59%–85%) | 0% |
| 0.9 | 29/39 (74%, 95% CI 59%–85%) | 0% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 13/18 (72%, 95% CI 49%–88%) | 7 | 13/18 (72%, 95% CI 49%–88%) | 7 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
- System One server: `{"name":"kev-latest","description":"Kev pointer head on Qwen/Qwen3.5-4B-Base, serving jaredpalmer/kev-4b@v1.0 at temperature 2.41","release_date":"2026-10-01","run":"jaredpalmer/kev-4b@v1.0","base":"Qwen/Qwen3.5-4B-Base","lora":16,"device":"mps","backend":"mlx","dtype":"bfloat16","temperature":2.406`
