# Switching cost benchmark

Run 2026-10-18T13:03:29.392Z. Median of 3 repetitions. Context text: repository documents and source (recorded sessions too short or absent).

"Reprocessed" is prompt-processing time as a share of a cold read of the same context by the same model: about 0% means the cache was reused, about 100% means the whole context was read again.

## mixed-family

The shipped tiers: gemma4:e2b (small) and qwen3.6:35b with thinking off (medium) or on (large)

| transition | from | to | context | load | prompt | first token | reprocessed |
|---|---|---|---|---|---|---|---|
| baseline | qwen3.6:35b-mlx | qwen3.6:35b-mlx | 2048 | 26 ms | 17 ms | 43 ms | 1% |
| thinking-toggled | qwen3.6:35b-mlx | qwen3.6:35b-mlx#thinking | 2048 | 25 ms | 12 ms | 37 ms | 1% |
| other-model-loaded | gemma4:e2b-mlx | qwen3.6:35b-mlx | 2048 | 25 ms | 1887 ms | 1912 ms | 100% |
| other-model-unloaded | gemma4:e2b-mlx | qwen3.6:35b-mlx | 2048 | 6174 ms | 2053 ms | 8343 ms | 109% |
| other-model-loaded | qwen3.6:35b-mlx | gemma4:e2b-mlx | 2048 | 43 ms | 418 ms | 461 ms | 96% |
| baseline | qwen3.6:35b-mlx | qwen3.6:35b-mlx | 8192 | 25 ms | 18 ms | 44 ms | 0% |
| thinking-toggled | qwen3.6:35b-mlx | qwen3.6:35b-mlx#thinking | 8192 | 26 ms | 13 ms | 39 ms | 0% |
| other-model-loaded | gemma4:e2b-mlx | qwen3.6:35b-mlx | 8192 | 26 ms | 9330 ms | 9356 ms | 120% |
| other-model-unloaded | gemma4:e2b-mlx | qwen3.6:35b-mlx | 8192 | 6489 ms | 8844 ms | 15696 ms | 114% |
| other-model-loaded | qwen3.6:35b-mlx | gemma4:e2b-mlx | 8192 | 43 ms | 2177 ms | 2221 ms | 120% |

## same-family

Two Qwen models: qwen3.6:35b and qwen3.8:27b

| transition | from | to | context | load | prompt | first token | reprocessed |
|---|---|---|---|---|---|---|---|
| baseline | qwen3.8:27b-nvfp4 | qwen3.8:27b-nvfp4 | 2048 | 29 ms | 71 ms | 100 ms | 0% |
| other-model-loaded | qwen3.6:35b-mlx | qwen3.8:27b-nvfp4 | 2048 | 30 ms | 16481 ms | 16511 ms | 89% |
| other-model-unloaded | qwen3.6:35b-mlx | qwen3.8:27b-nvfp4 | 2048 | 6203 ms | 16496 ms | 23615 ms | 89% |
| baseline | qwen3.8:27b-nvfp4 | qwen3.8:27b-nvfp4 | 8192 | 32 ms | 78 ms | 110 ms | 0% |
| other-model-loaded | qwen3.6:35b-mlx | qwen3.8:27b-nvfp4 | 8192 | 33 ms | 78310 ms | 78344 ms | 115% |
| other-model-unloaded | qwen3.6:35b-mlx | qwen3.8:27b-nvfp4 | 8192 | 5841 ms | 77465 ms | 83916 ms | 114% |

## single-model

One model at different effort levels: gpt-oss:20b low and high

| transition | from | to | context | load | prompt | first token | reprocessed |
|---|---|---|---|---|---|---|---|
| baseline | gpt-oss:20b#low | gpt-oss:20b#low | 2048 | 170 ms | 22 ms | 192 ms | 2% |
| effort-changed | gpt-oss:20b#low | gpt-oss:20b#high | 2048 | 170 ms | 1637 ms | 1807 ms | 95% |
| baseline | gpt-oss:20b#low | gpt-oss:20b#low | 8192 | 169 ms | 23 ms | 192 ms | 0% |
| effort-changed | gpt-oss:20b#low | gpt-oss:20b#high | 8192 | 169 ms | 7674 ms | 7843 ms | 101% |
