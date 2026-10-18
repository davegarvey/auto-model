# Design

## Context

The repository is empty apart from OpenSpec. The motivation is in proposal.md (Why). The requirements are in `specs/`. The design is shaped by what exists on the target machine (a 64 GB M5 Pro) and in OpenCode v2:

- **OpenCode v2.0.30 is installed.** v2 has a new plugin API, `@opencode/plugin`, unlike the v1 API that opencode.ai documents. These source-level facts were checked against the current `dev` branch:
  - The session runner reloads the session, including its model, before every step.
  - `ctx.session.switchModel({ sessionID, model })` is available to plugins. A model reference can carry a `variant`.
  - `session.hook("prompt")` fires when a user message is admitted.
  - The sub-agent tool creates child sessions, and child sessions receive their own prompt.
  - The model is read-only in `session.hook("context")`.
  - Project-level `opencode.json` is discovered, and declares plugins under `plugins`.
- **Ollama 0.32.14 is installed.** It already holds `gemma4:e2b-mlx` and `qwen3.6:35b-mlx`. On boolean-thinking models, `reasoning_effort` collapses to on or off: Qwen 3.6 gave the same output at low, medium and high.
- **The local probe** (scratchpad, not committed):
  - Qwen 3.6 with thinking off answered an easy arithmetic question wrongly three times out of three.
  - With thinking on it answered correctly, taking about 10 s.
  - Changing gpt-oss's effort level forced a full re-read of a 6,000-token prompt: 4.4 s, against 0.02 s with the cache reused.
- **Kev-4B** serves `/v1/systemone` through MLX. It peaks at about 8.4 GB with full weights. It is validated to 8,192 tokens of state, and its README reports 721 ms cold and 136 ms warm for five questions on a short text.

## Goals / Non-Goals

**Goals:**
- One routing core used by both the live OpenCode plugin and the offline evaluation, so that measured behaviour is the behaviour that runs.
- Everything runs locally, with no accounts or API keys.
- The cheapest credible version of each part. This is an experiment, not a product.

**Non-Goals:**
- Changing tier between tool steps within a turn (see the opencode-integration spec).
- Supporting OpenCode v1 or other agents.
- Automatic installation of Ollama, Kev or OpenCode. The README documents manual steps.
- Statistical rigour beyond reporting sample sizes and simple confidence intervals.

## Decisions

### 1. TypeScript, one package, three entry points
The layout is `src/core` (config, state builder, routers, policy, log), `src/plugin` (the OpenCode adapter) and `src/eval` (the evaluation command line tool). The core has no OpenCode imports.

- **Plugin:** loaded by OpenCode from the project's `opencode.json` `plugins` list.
- **Evaluation:** runs under Node 24 using its built-in TypeScript type stripping, with no build step.
- **Rationale:** the plugin must be TypeScript, and sharing the core rules out drift between live and evaluated behaviour.
- **Alternatives considered:**
  - Python evaluation with a TypeScript plugin, which duplicates the state builder and policy.
  - A monorepo with workspaces, which is unnecessary at this size.

### 2. Routing at `session.hook("prompt")` with `switchModel`
In the prompt hook, the plugin:
1. builds the state from the session's messages and the incoming prompt;
2. calls the configured router;
3. applies the policy (decision 6);
4. calls `ctx.session.switchModel` with the tier's model reference and variant when the tier changes.

Sub-agent sessions go through the same hook.

- **Rationale:** this is the only per-turn hook that can change which model the runner loads.
- **Alternatives considered:**
  - A local proxy that OpenCode points at. Routing across model families would mean translating request formats, and it hides the switch from OpenCode's own view of the session.
  - `aisdk.hook("language")`, which swaps the language model object per request. It is undocumented for this purpose and not visible in the user interface. It is kept as the fallback if the spike fails.
- **Verification:** spike task 1.2 confirms that the switch applies to the same turn.

### 3. Manual override detection
The plugin remembers the model reference it last applied to each session. When the prompt hook fires and the session's current model differs from that reference, the user changed it by hand. The plugin marks the session as overridden and stops routing it.

A plugin command, `/auto-model on|off|status`, re-enables or disables routing and shows its state.

- **Alternative considered:** a configuration flag only. That cannot express "this session only".

### 4. Tiers as one Ollama provider with variants
The project's `opencode.json` declares an `ollama` provider, as the user's global config already does, with the following variants. `reasoningEffort: none` maps to thinking off in Ollama.

| Model | Variants |
|---|---|
| `gemma4:e2b-mlx` | `none` |
| `qwen3.6:35b-mlx` | `none`, `high` |

The routing configuration file `auto-model.config.json` maps each tier to a model reference such as `ollama/qwen3.6:35b-mlx#high`. It also holds the router choice, endpoints, threshold, margin, state budget, timeout and log path.

- **Rationale:** using variants of one model shares weights and memory between the medium and large tiers, and OpenCode already handles effort changes within a model.
- **Note:** the user's global config is not touched.

### 5. State layout for Kev
The state is a JSON object in a fixed field order:
1. `earlier_turns`: an array of `{from, text}`, oldest first, carried over unchanged between turns;
2. `recent_tools`: a short list of tool names and outcomes from the last turn, without contents;
3. `current_tier`;
4. `latest_message`.

Content that changes from turn to turn sits at the end, which keeps the prefix stable for Kev's cache. Trimming drops whole turns from the front.

Token budgeting uses a conservative estimate of characters ÷ 3.5. The token count Kev reports in `usage.input_tokens` is logged, so the estimate's error is measurable.

- **Alternative considered:** loading Qwen's tokeniser in TypeScript. That adds a dependency for little accuracy gain at an 8k budget.

### 6. Policy: fallback first, then hysteresis
The question is a single `choice`, with the tier descriptions as criteria. The policy then applies, in order:
1. if the endpoint errored, keep the current tier, or the default if there is none;
2. if confidence is below the threshold, apply the default tier;
3. if a current tier exists and the proposed tier's probability minus the current tier's is below the margin, keep the current tier;
4. otherwise, apply the proposed tier.

The defaults are a threshold of 0.4 and a margin of 0.15. The evaluation sweep chooses the final values.

- **Rationale:** these are simple, explainable rules that the evaluation can simulate exactly.
- **Alternative considered:** an extra `noul` question asking whether the task has changed. Deferred: it adds a second signal before the first is understood.

### 7. Hand-rolled System One client
A small `fetch` client posts to `{baseURL}/v1/systemone` with a timeout set through `AbortController`. Responses are validated by hand into typed results.

- **Rationale:** TypeSafe's TypeScript SDK is untested against Kev, and the API surface used here is one endpoint and one question type.
- **Alternative considered:** `@typesafe-ai/sdk`. Kev's documentation only confirms that the Python SDK works against it.

### 8. Baselines

**Embedding router:**
- Uses Ollama's `/api/embed` with `embeddinggemma`, which is small and local. The model is configurable.
- Uses k-nearest neighbours with cosine similarity, k = 5, over `data/router-examples.jsonl`: about 10 examples per tier, written separately from the evaluation set.
- Confidence is the similarity-weighted vote share of the winning tier.
- The router embeds the same state text that Kev receives.

**Small-LLM router:**
- Uses `gemma4:e2b-mlx` through Ollama's `/api/chat`, with `format` set to a JSON schema of `{tier, confidence}` and thinking off.
- The prompt lists the same tier descriptions.
- Its self-reported confidence is used as is, and is documented as uncalibrated.

**Alternative considered:** RouteLLM. It is trained for strong and weak model pairs on Chatbot Arena data, routes on a single prompt, and would need retraining for three tiers.

### 9. Offline evaluation from recorded sessions
Single-prompt cases are stored in `data/eval/prompts.jsonl`, each with `id`, `text` and `label`.

Multi-turn sessions are stored in `data/eval/sessions/*.json`. Each is an ordered list of turns, `{user, assistant_summary, tools[], label}`, built from a real OpenCode session and then labelled by the user. The evaluation reconstructs each turn's state with the same state builder used live, so no OpenCode instance is needed to run it.

Output goes to `results/<date>-<shortsha>/`:
- `report.md`;
- `report.json`;
- `decisions.jsonl`, with state capture on.

Agreement is reported with counts and Wilson 95% intervals, because the sample is small.

- **Rationale:** a recorded session is deterministic and can be published. A live replay would also measure the tier models' behaviour, which is a different question.

### 10. Decision log
Records are written as JSON Lines, one `appendFile` per record.

| Use | Default path |
|---|---|
| Live | `~/.local/state/auto-model/decisions.jsonl` |
| Evaluation | the run directory |

State text is excluded unless capture is enabled. The routing cost price is per router and defaults to 0 for local routers.

### 11. Kev served out-of-process
`scripts/serve-kev.sh`:
1. clones Kev at a pinned commit into an ignored `vendor/kev`;
2. runs `uv sync --extra serve`;
3. starts `kev.serve --run jaredpalmer/kev-4b@v1.0 --port 8009`.

The plugin sends one small warm-up request at start-up, so that the first real turn does not pay the model load time.

### 12. Switching cost benchmark against Ollama directly
The benchmark lives in `src/eval/switch-cost.ts` and calls Ollama's `/api/chat`, bypassing OpenCode and the routers. For each transition, it:
1. issues a warm-up request that establishes the "from" state;
2. sends the "to" request with the same conversation text;
3. reads `load_duration`, `prompt_eval_duration` and `prompt_eval_count` from Ollama's response.

The "not loaded" case first unloads the target with `keep_alive: 0`. Each measurement is repeated three times and the median is reported.

The context is cut from the recorded multi-turn session's text, so it resembles real coding context rather than repeated filler. The three tier designs are:
- **Two-model:** the shipped tiers.
- **Single-model:** `gpt-oss:20b` at low, medium and high, the only installed model with named effort levels.
- **Mixed-family:** `gemma4:e2b-mlx` and `qwen3.6:35b-mlx`, which already covers a move across families.

Designs run one after another, so that memory is not contended.

- **Rationale:** routing accuracy does not depend on how tiers are implemented, but switching cost does. Measuring at the inference server isolates that cost from OpenCode's own overheads.
- **Alternative considered:** measuring inside live OpenCode sessions. That is noisier and mixes in tool time, though the decision log from task 8.3 still gives a real-world check.
- **Follow-up, not in this change:** a hysteresis margin that grows with context size, using these measurements.

## Risks / Trade-offs

- **`switchModel` applies only from the next turn.** → Spike first (task 1.2). The fallbacks, in order, are the `aisdk.hook("language")` swap, then routing from the previous turn's end; the second is weaker and would be reported as such.
- **Kev's 8k budget drops older context** in long sessions. → The state-size sweep measures this directly. A summary of earlier work stays in the state, and the limitation is stated in the write-up.
- **GPU and memory contention.** Kev, two Ollama models and their context caches total about 41 GB, near the default GPU limit. → Routing runs before generation, not alongside it. Watch memory pressure during the spikes, and drop to Kev-0.8B or gemma4:e4b if needed.
- **The `small` tier (gemma4:e2b) may fail at multi-step tool use.** → This is acceptable and realistic for the cheapest tier. Swapping to gemma4:e4b is a configuration change.
- **Labels reflect one person's judgement** on about 20 prompts, so agreement intervals will be wide. → Report counts and intervals. Present results as indicative, not as benchmarks.
- **Turning thinking on and off may invalidate Qwen's cached prompt,** as effort changes did for gpt-oss. → The switching cost benchmark (decision 12) measures it. A large cost would be reported, not designed around, in this change.
- **The v2 plugin API is new** and may change between patch releases. → Pin the OpenCode version in the README and in report metadata.

## Migration Plan

This is greenfield work, so nothing is migrated. The user's setup steps are:
1. upgrade `opencode-v2`;
2. pull the models;
3. run `scripts/serve-kev.sh`;
4. open OpenCode in a project whose `opencode.json` loads the plugin.

Rollback is removing the plugin entry. The global configuration is never modified.

## Open Questions

- Final tier descriptions. The first wording is in the config, and changes to it are tuning, not design.
- Which public repository or task to use for the recorded multi-turn session.
