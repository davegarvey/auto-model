# Spike: same-turn model switch (task 1.2)

**Result: passed.** A plugin calling `ctx.session.switchModel` inside `session.hook("prompt")` changes the model used by the same turn's first model request.

## Set-up

- OpenCode v2.0.30 (Homebrew `opencode-v2`), `opencode run --standalone`.
- Throwaway plugin in `.opencode/plugins/spike-switch.ts` (auto-discovered, since removed). On every prompt it switched to `ollama/gemma4:e2b-mlx#none`, and it logged every `session.hook("model.request")`.
- Session started on `ollama/qwen3.6:35b-mlx#none` via `-m`.

## Evidence (from `spike-switch.log`)

```
10:08:25.465 prompt    ses_eb1841b20ffemuE9mhNbqy5abC
10:08:25.470 switched  (switchModel returned after 5 ms)
10:08:25.507 model.request kind=primary model=ollama/gemma4:e2b-mlx#none
10:08:25.514 model.request kind=title   model=openai/gpt-5.6-luna#none
```

- The reply ("ready") came from Gemma.
- `ollama ps` afterwards showed only `gemma4:e2b-mlx` loaded; Qwen was never loaded.

## Findings that affect the build

1. **No fallback is needed.** The `aisdk.hook("language")` route was not tested.
2. **Title generation leaks to a hosted model.** OpenCode sends a `title` request to the configured `small_model`, here the user's global `openai/gpt-5.6-luna`. The project config must set a local `small_model`, or the first prompt of every session goes to OpenAI.
3. **Not every request is a turn.** The `model.request` hook reports a `kind` (`primary`, `title`, `compaction`, `generate`). The plugin routes only on the prompt hook, so auxiliary requests are unaffected, but the decision log should not count them as turns.
4. **The first `opencode run` attempt hung** after plugin set-up and never reached the prompt hook. It was stopped after five minutes. An identical second run worked in about 11 s. The cause is unknown; first-run initialisation is suspected. If it recurs, note it in the README.
