# Routing evaluation

Run 2026-10-18T18:40:25.931Z at commit `58eb060`, dataset revision `ad716c3`: 8 prompts, 1 sessions (7 turns).
Threshold 0.1, margin 0.15, state budget 8192 tokens, default tier medium.

Agreement is with the single tier the user labelled. Intervals are Wilson 95%; the sample is small, so read them before the point estimates. Each router was called once before measuring, so latencies exclude one-off model loading.

## Summary

| router | proposed vs label | prompts | turns | applied vs label | median latency | p95 latency |
|---|---|---|---|---|---|---|
| systemone | 9/15 (60%, 95% CI 36%–80%) | 4/8 (50%, 95% CI 22%–78%) | 5/7 (71%, 95% CI 36%–92%) | 7/15 (47%, 95% CI 25%–70%) | 801 ms | 2217 ms |

## State-size sweep (systemone, multi-turn turns)

| budget (tokens) | agreement | median latency | median state tokens | turns truncated |
|---|---|---|---|---|
| 2048 | 7/7 (100%, 95% CI 65%–100%) | 170 ms | 233 | 0 |
| 4096 | 7/7 (100%, 95% CI 65%–100%) | 170 ms | 233 | 0 |
| 8192 | 7/7 (100%, 95% CI 65%–100%) | 171 ms | 233 | 0 |
| 16384 | 7/7 (100%, 95% CI 65%–100%) | 172 ms | 233 | 0 |

## Routers

### systemone (kev-latest)

- Proposed tier vs label, all cases: 9/15 (60%, 95% CI 36%–80%)
- Single prompts: 4/8 (50%, 95% CI 22%–78%); multi-turn turns: 5/7 (71%, 95% CI 36%–92%)
- Applied tier (threshold and hysteresis as configured) vs label: 7/15 (47%, 95% CI 25%–70%)
- Routing latency: median 801 ms, p95 2217 ms
- Routing tokens: 27094 in, 938 out; estimated cost $0.000000; errors 0

Confusion (rows are your labels, columns the router's proposal):

| label \ chosen | small | medium | large | error |
|---|---|---|---|---|
| small | 4 | 1 | 0 | 0 |
| medium | 1 | 4 | 0 | 0 |
| large | 0 | 4 | 1 | 0 |

Confidence-threshold sweep (fallback to the default tier only, no hysteresis):

| threshold | agreement | fallback rate |
|---|---|---|
| 0.0 | 9/15 (60%, 95% CI 36%–80%) | 0% |
| 0.1 | 9/15 (60%, 95% CI 36%–80%) | 7% |
| 0.2 | 8/15 (53%, 95% CI 30%–75%) | 60% |
| 0.3 | 7/15 (47%, 95% CI 25%–70%) | 80% |
| 0.4 | 7/15 (47%, 95% CI 25%–70%) | 87% |
| 0.5 | 6/15 (40%, 95% CI 20%–64%) | 93% |
| 0.6 | 6/15 (40%, 95% CI 20%–64%) | 93% |
| 0.7 | 6/15 (40%, 95% CI 20%–64%) | 93% |
| 0.8 | 5/15 (33%, 95% CI 15%–58%) | 100% |
| 0.9 | 5/15 (33%, 95% CI 15%–58%) | 100% |

Sessions, applied tiers as live routing would apply them:

| session | turns | with hysteresis | switches | without hysteresis | switches |
|---|---|---|---|---|---|
| terse-follow-ups | 7 | 3/7 (43%, 95% CI 16%–75%) | 1 | 7/7 (100%, 95% CI 65%–100%) | 2 |

## Versions

- Node 24.21.0, OpenCode opencode v2.0.30, Ollama 0.32.14
- embeddinggemma:latest: `85462619ee72`
- gemma4:e2b-mlx: `e98b54fe1913`
- qwen3.6:35b-mlx: `1b50c6fdc2d4`
- System One server: `{"name":"kev-latest","description":"Kev pointer head on Qwen/Qwen3.5-4B-Base, serving jaredpalmer/kev-4b@v1.0 at temperature 2.41","release_date":"2026-10-01","run":"jaredpalmer/kev-4b@v1.0","base":"Qwen/Qwen3.5-4B-Base","lora":16,"device":"mps","backend":"mlx","dtype":"bfloat16","temperature":2.406`
