# Routing evaluation

Run 2026-10-18T18:40:09.446Z at commit `58eb060`, dataset revision `ad716c3`: 8 prompts, 1 sessions (7 turns).
Threshold 0.1, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| embedding-latest | 8/15 (53%, 95% CI 30%–75%) | 4/8 (50%, 95% CI 22%–78%) | 4/7 (57%, 95% CI 25%–84%) | 8/15 (53%, 95% CI 30%–75%) | 152 ms | 159 ms |

## Routers

### embedding-latest (embeddinggemma)

- Proposed tier vs label, all cases: 8/15 (53%, 95% CI 30%–75%)
- Single prompts: 4/8 (50%, 95% CI 22%–78%); multi-turn turns: 4/7 (57%, 95% CI 25%–84%)
- Applied tier (threshold and hysteresis as configured) vs label: 8/15 (53%, 95% CI 30%–75%)
- Routing latency: median 152 ms, p95 159 ms
- Routing tokens: 16519 in, 0 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 1 | 2 | 2 | 0 |
| medium | 0 | 2 | 3 | 0 |
| large | 0 | 0 | 5 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 8/15 (53%, 95% CI 30%–75%) | 0% |
| 0.1 | 8/15 (53%, 95% CI 30%–75%) | 0% |
| 0.2 | 8/15 (53%, 95% CI 30%–75%) | 13% |
| 0.3 | 8/15 (53%, 95% CI 30%–75%) | 13% |
| 0.4 | 9/15 (60%, 95% CI 36%–80%) | 20% |
| 0.5 | 9/15 (60%, 95% CI 36%–80%) | 33% |
| 0.6 | 9/15 (60%, 95% CI 36%–80%) | 33% |
| 0.7 | 9/15 (60%, 95% CI 36%–80%) | 60% |
| 0.8 | 5/15 (33%, 95% CI 15%–58%) | 100% |
| 0.9 | 5/15 (33%, 95% CI 15%–58%) | 100% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| terse-follow-ups | 7 | 4/7 (57%, 95% CI 25%–84%) | 1 | 4/7 (57%, 95% CI 25%–84%) | 3 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
- System One server: `{"name":"kev-latest","description":"Kev pointer head on Qwen/Qwen3.5-4B-Base, serving jaredpalmer/kev-4b@v1.0 at temperature 2.41","release_date":"2026-10-01","run":"jaredpalmer/kev-4b@v1.0","base":"Qwen/Qwen3.5-4B-Base","lora":16,"device":"mps","backend":"mlx","dtype":"bfloat16","temperature":2.406`
