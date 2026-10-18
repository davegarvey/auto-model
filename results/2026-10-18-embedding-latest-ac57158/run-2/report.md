# Routing evaluation

Run 2026-10-18T18:27:07.663Z at commit `ac57158`, dataset revision `ad716c3`: 21 prompts, 1 sessions (18 turns).
Threshold 0.1, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| embedding-latest | 30/39 (77%, 95% CI 62%–87%) | 18/21 (86%, 95% CI 65%–95%) | 12/18 (67%, 95% CI 44%–84%) | 31/39 (79%, 95% CI 64%–89%) | 76 ms | 82 ms |

## Routers

### embedding-latest (embeddinggemma)

- Proposed tier vs label, all cases: 30/39 (77%, 95% CI 62%–87%)
- Single prompts: 18/21 (86%, 95% CI 65%–95%); multi-turn turns: 12/18 (67%, 95% CI 44%–84%)
- Applied tier (threshold and hysteresis as configured) vs label: 31/39 (79%, 95% CI 64%–89%)
- Routing latency: median 76 ms, p95 82 ms
- Routing tokens: 953 in, 0 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 9 | 7 | 0 | 0 |
| medium | 1 | 11 | 1 | 0 |
| large | 0 | 0 | 10 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 30/39 (77%, 95% CI 62%–87%) | 0% |
| 0.1 | 31/39 (79%, 95% CI 64%–89%) | 3% |
| 0.2 | 29/39 (74%, 95% CI 59%–85%) | 15% |
| 0.3 | 29/39 (74%, 95% CI 59%–85%) | 15% |
| 0.4 | 28/39 (72%, 95% CI 56%–83%) | 36% |
| 0.5 | 26/39 (67%, 95% CI 51%–79%) | 49% |
| 0.6 | 26/39 (67%, 95% CI 51%–79%) | 49% |
| 0.7 | 22/39 (56%, 95% CI 41%–71%) | 64% |
| 0.8 | 19/39 (49%, 95% CI 34%–64%) | 85% |
| 0.9 | 19/39 (49%, 95% CI 34%–64%) | 85% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 12/18 (67%, 95% CI 44%–84%) | 7 | 12/18 (67%, 95% CI 44%–84%) | 7 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
