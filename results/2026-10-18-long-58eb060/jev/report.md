# Routing evaluation

Run 2026-10-18T18:46:48.535Z at commit `58eb060`, dataset revision `ad716c3`: 8 prompts, 1 sessions (7 turns).
Threshold 0.1, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| jev | 15/15 (100%, 95% CI 80%–100%) | 8/8 (100%, 95% CI 68%–100%) | 7/7 (100%, 95% CI 65%–100%) | 15/15 (100%, 95% CI 80%–100%) | 360 ms | 764 ms |

## Routers

### jev (typesafe/jev-1.13, reported typesafe/jev-1.13-20260917)

- Proposed tier vs label, all cases: 15/15 (100%, 95% CI 80%–100%)
- Single prompts: 8/8 (100%, 95% CI 68%–100%); multi-turn turns: 7/7 (100%, 95% CI 65%–100%)
- Applied tier (threshold and hysteresis as configured) vs label: 15/15 (100%, 95% CI 80%–100%)
- Routing latency: median 360 ms, p95 764 ms
- Routing tokens: 32582 in, 570 out; estimated cost $0.002737; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 5 | 0 | 0 | 0 |
| medium | 0 | 5 | 0 | 0 |
| large | 0 | 0 | 5 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 15/15 (100%, 95% CI 80%–100%) | 0% |
| 0.1 | 15/15 (100%, 95% CI 80%–100%) | 0% |
| 0.2 | 15/15 (100%, 95% CI 80%–100%) | 0% |
| 0.3 | 15/15 (100%, 95% CI 80%–100%) | 0% |
| 0.4 | 15/15 (100%, 95% CI 80%–100%) | 0% |
| 0.5 | 15/15 (100%, 95% CI 80%–100%) | 7% |
| 0.6 | 13/15 (87%, 95% CI 62%–96%) | 20% |
| 0.7 | 13/15 (87%, 95% CI 62%–96%) | 20% |
| 0.8 | 12/15 (80%, 95% CI 55%–93%) | 27% |
| 0.9 | 11/15 (73%, 95% CI 48%–89%) | 40% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| terse-follow-ups | 7 | 7/7 (100%, 95% CI 65%–100%) | 2 | 7/7 (100%, 95% CI 65%–100%) | 2 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
- System One server: `{"name":"kev-latest","description":"Kev pointer head on Qwen/Qwen3.5-4B-Base, serving jaredpalmer/kev-4b@v1.0 at temperature 2.41","release_date":"2026-10-01","run":"jaredpalmer/kev-4b@v1.0","base":"Qwen/Qwen3.5-4B-Base","lora":16,"device":"mps","backend":"mlx","dtype":"bfloat16","temperature":2.406`
