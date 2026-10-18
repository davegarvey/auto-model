# Routing evaluation

Run 2026-10-18T15:56:31.492Z at commit `51a31cf`, dataset revision `ad716c3`: 21 prompts, 1 sessions (18 turns).
Threshold 0.1, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| jev | 37/39 (95%, 95% CI 83%–99%) | 20/21 (95%, 95% CI 77%–99%) | 17/18 (94%, 95% CI 74%–99%) | 37/39 (95%, 95% CI 83%–99%) | 350 ms | 697 ms |

## Routers

### jev (typesafe/jev-1.13, reported typesafe/jev-1.13-20260917)

- Proposed tier vs label, all cases: 37/39 (95%, 95% CI 83%–99%)
- Single prompts: 20/21 (95%, 95% CI 77%–99%); multi-turn turns: 17/18 (94%, 95% CI 74%–99%)
- Applied tier (threshold and hysteresis as configured) vs label: 37/39 (95%, 95% CI 83%–99%)
- Routing latency: median 350 ms, p95 697 ms
- Routing tokens: 30248 in, 1482 out; estimated cost $0.002541; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 16 | 0 | 0 | 0 |
| medium | 0 | 12 | 1 | 0 |
| large | 1 | 0 | 9 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 37/39 (95%, 95% CI 83%–99%) | 0% |
| 0.1 | 37/39 (95%, 95% CI 83%–99%) | 0% |
| 0.2 | 37/39 (95%, 95% CI 83%–99%) | 0% |
| 0.3 | 37/39 (95%, 95% CI 83%–99%) | 0% |
| 0.4 | 36/39 (92%, 95% CI 80%–97%) | 5% |
| 0.5 | 36/39 (92%, 95% CI 80%–97%) | 5% |
| 0.6 | 35/39 (90%, 95% CI 76%–96%) | 13% |
| 0.7 | 35/39 (90%, 95% CI 76%–96%) | 13% |
| 0.8 | 35/39 (90%, 95% CI 76%–96%) | 21% |
| 0.9 | 34/39 (87%, 95% CI 73%–94%) | 31% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| cli-option-and-flaky-test | 18 | 17/18 (94%, 95% CI 74%–99%) | 10 | 17/18 (94%, 95% CI 74%–99%) | 10 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
