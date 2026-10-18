# Spike: serving Kev-4B locally (task 1.3)

**Result: works, with one design consequence.** Kev-4B serves `/v1/systemone` on the M5 Pro through MLX and routes plausibly. However, its cache only helps when the state is byte-for-byte identical, so routing time grows with state size on every turn.

## Set-up

- `scripts/serve-kev.sh`:
  - Kev pinned to tag `kev-1.0` (`6b719c3`);
  - `uv sync --extra serve`, giving a 1.0 GB virtual environment with torch 2.8, transformers 5.17 and mlx-lm;
  - `jaredpalmer/kev-4b@v1.0`.
- `kev-4b@v1.0` on Hugging Face is a LoRA adapter (160 MB) over `Qwen/Qwen3.5-4B-Base` (9.3 GB). Both download on first start, about 10 minutes here.
- Server log: `serving jaredpalmer/kev-4b@v1.0 … on mps via mlx (bfloat16) 127.0.0.1:8009; states over 65,536 tokens refused (422)`.

## Decisions on short states

The question was one `choice` over the three tier descriptions in `auto-model.config.json`, with an empty history.

| Prompt | Choice | Confidence | Probabilities (s / m / l) | Input tokens | Time |
|---|---|---|---|---|---|
| "What does the --force flag do in our deploy script?" | small | 0.59 | 0.73 / 0.15 / 0.13 | 191 | 3,425 ms (first call) |
| Intermittent production deadlock, design a fix | large | 0.58 | 0.05 / 0.23 / 0.72 | 219 | 276 ms |
| Same two again | same | same | same | – | 186 ms, 178 ms |

- Deterministic: repeated calls return identical probabilities.
- `confidence` is the top probability rescaled from chance (1/3) to 1, so 0.72 becomes about 0.58. Thresholds must be read on that scale.
- The first request pays a one-off warm-up of about 3 s, so the plugin's start-up warm-up call is worth having.

## Long states and caching

The history was 14 messages of about 1,500 characters each (3,700 tokens); `current_tier` was `medium`.

| Case | Input tokens | Time | Choice (confidence) |
|---|---|---|---|
| Cold (first long state) | 3,696 | 9,192 ms | small (0.22) |
| Identical state again | 3,696 | 248 ms | small (0.22) |
| Same history plus one appended turn | 3,721 | 3,086 ms | medium (0.32) |
| Two oldest messages dropped | 2,887 | 2,288 ms | medium (0.46) |

- **Kev reuses work only for an identical state.** Its cache is keyed on the full state token sequence (`PrefixCache` in `kev/serve.py`), not on prefixes. Appending a turn costs roughly as much as a fresh state, about 0.8 ms per token once warm. The design's prefix-stable layout (design decision 5) therefore buys nothing with Kev; it would only matter for a server that reuses prefixes.
- **Projected routing time per turn:** about 1.6 s at 2k tokens, 3.3 s at 4k and 6.5 s at the 8k default. The default 5 s timeout would fail most turns at the full budget.
- **Confidence on long, unlabelled states was low** (0.22–0.46), so many would fall back under the 0.4 threshold. The evaluation's threshold sweep is needed before trusting the default.

## Memory with everything loaded

Measured with `footprint`:

| Process | Footprint |
|---|---|
| Kev-4B (Python child), steady | 10 GB |
| Kev-4B, peak while loading the adapter | 18 GB |
| `gemma4:e2b-mlx` runner | 6 GB |
| `qwen3.6:35b-mlx` runner | 21 GB |
| **Total, steady** | **about 37 GB** |
| **Total, at Kev start-up** | **about 45 GB** |

- `memory_pressure` reported 60% free.
- The full-weight checkpoint that Kev's README measures at 8.4 GB is not published for Kev-4B, so the adapter path, with its higher peak, is what runs.
