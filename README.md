# auto-model

An experiment in automatic model selection for a coding agent. Before each turn in [OpenCode](https://opencode.ai), a small local "System One" decision model, [Kev](https://github.com/jaredpalmer/kev), picks which tier of model should handle the request: small, medium or large. The agent then switches to that tier's model. Everything runs locally, with no accounts or API keys.

The repository accompanies a blog post arguing that manual model selection will go the way of the manual gearbox. It is a small, honest experiment, not a product. Findings are recorded as they happen in [`notes/LEARNINGS.md`](notes/LEARNINGS.md).

## Results

The write-up, [`WRITEUP.md`](WRITEUP.md), summarises what the experiment found. In brief:
- Locally, Kev chose the labelled tier for 30 of 39 clear-cut cases, and a small general model did about as well.
- In a follow-up, TypeSafe's hosted Jev chose it for 37 of 39.
- The embedding baseline did poorly.
- Switching between tiers costs anything from 40 ms to over a minute, depending on the models.

The raw results are in [`results/`](results/):

| Directory | Contents |
|---|---|
| `2026-10-18-ad716c3` | Routing evaluation at the original threshold of 0.4 |
| `2026-10-18-615db61` | Routing evaluation at the tuned threshold of 0.1 |
| `2026-10-18-jev-51a31cf` | Follow-up: hosted Jev, three runs over the same cases |
| `2026-10-18-switch-cost` | Switching cost benchmark |
| `2026-10-18-live` | Decision log of a live OpenCode session |

Every decision is in the `decisions.jsonl` files.

## How it works

```
prompt in OpenCode
  -> plugin builds a compact state from recent turns (default budget 8,192 tokens)
  -> Kev answers a typed "choice" question over the tier descriptions -> tier + confidence
  -> policy: low confidence -> default tier; marginal preference -> keep current tier
  -> plugin switches the session model (if the tier changed) and logs the decision
  -> the turn runs on that tier's model in Ollama
```

The tiers are defined in [`auto-model.config.json`](auto-model.config.json). Kev only ever sees each tier's description, never a model name. The shipped tiers are:

| Tier | Model | Thinking |
|---|---|---|
| small | `gemma4:e2b-mlx` | off |
| medium | `qwen3.6:35b-mlx` | off |
| large | `qwen3.6:35b-mlx` | on |

The models are illustrative. Change them in the configuration (and in `opencode.json`) without touching code.

## Requirements

What it was built and tested on:

- An Apple Silicon Mac with 64 GB of memory. Steady use takes about 37 GB, peaking around 45 GB while Kev loads.
- [OpenCode v2](https://opencode.ai), 2.0.30 or later.
- [Ollama](https://ollama.com), 0.32 or later.
- [uv](https://docs.astral.sh/uv/), for Kev's Python environment.
- Node.js 24 or later, for the tests and command line tools.

## Setup

1. Pull the tier models:

   ```bash
   ollama pull gemma4:e2b-mlx
   ```

   ```bash
   ollama pull qwen3.6:35b-mlx
   ```

2. Start Kev. The first run clones Kev at its `kev-1.0` tag into `vendor/kev`, installs its dependencies, and downloads about 9.5 GB of weights. Later runs start in under a minute.

   ```bash
   ./scripts/serve-kev.sh
   ```

   Leave it running. It serves `POST /v1/systemone` on `http://localhost:8009`.

3. Check that routing works without OpenCode:

   ```bash
   node src/eval/route-once.ts "Rename the variable cnt to count in utils.ts"
   ```

   You should see something like `proposed small (confidence 0.82 …) -> applied small`.

4. Open OpenCode in this directory. The project's `opencode.json` defines the Ollama provider and tier variants, and keeps OpenCode's auxiliary requests (such as session titles) on local models. `.opencode/plugins/auto-model.ts` loads the plugin automatically. Your global OpenCode configuration is not changed.

   ```bash
   opencode
   ```

## Usage

Work as normal. Each prompt, including the prompts OpenCode gives to sub-agents, is routed before it runs.

- **Decision log:** `~/.local/state/auto-model/decisions.jsonl`, one JSON object per decision. Each records the tier, confidence, probabilities, reason, latency and state size. Prompt text is left out unless `log.captureState` is set.
- **Plugin diagnostics:** `~/.local/state/auto-model/plugin.log`.
- **`/auto-model on | off | status`:** turns routing on or off for the current session, or shows its state.
- **Choosing a model by hand** pauses routing for that session until `/auto-model on`.

For scripted runs, use `scripts/oc-run.sh` (the same arguments as `opencode run`) rather than `opencode run` directly; see the known issues below.

## Using just the plugin

The plugin is not packaged. To add it to another project, copy three things into that project's `.opencode` directory:
- `src/core`, the routing, which has no OpenCode dependency;
- `src/plugin`, the OpenCode adapter;
- `auto-model.config.json`.

No dependencies are needed beyond Node's standard library.

```bash
mkdir -p /path/to/project/.opencode/auto-model/src /path/to/project/.opencode/plugins
```

```bash
cp -R src/core src/plugin /path/to/project/.opencode/auto-model/src/
```

```bash
cp auto-model.config.json /path/to/project/.opencode/auto-model/
```

```bash
echo 'export { default } from "../auto-model/src/plugin/index.ts"' > /path/to/project/.opencode/plugins/auto-model.ts
```

Then make sure of two things:
- every tier's model and variant in the copied configuration exists in that project's `opencode.json` (see this repository's [`opencode.json`](opencode.json));
- Kev is running (`scripts/serve-kev.sh`).

The plugin reads `.opencode/auto-model/auto-model.config.json`, or the file named by `AUTO_MODEL_CONFIG`. The `*.test.ts` files can be left out. With `"router": "embedding"`, also copy `data/router-examples.jsonl` to `.opencode/auto-model/data/`.

## Configuration

`auto-model.config.json`. A different file can be set with `AUTO_MODEL_CONFIG`.

| Key | Default | Meaning |
|---|---|---|
| `tiers` | small, medium, large | `id`, `description` (what Kev sees), `model` (`provider/model`) and `variant` (the thinking setting) |
| `defaultTier` | `medium` | Used on low confidence or when the router is unavailable with no current tier |
| `router` | `systemone` | `systemone` (Kev), `jev` (hosted Jev, through a reseller), `embedding` or `llm` (the baselines) |
| `embedding.input` | `state` | What the embedding baseline embeds: `state`, the whole routing state, or `latest`, only the message being routed, as the examples are |
| `jev.*` | see file | Hosted Jev: base URL, request path, model and price. The key is read from the environment variable named by `jev.apiKeyEnv` (default `DEFAPI_API_KEY`) and is never written to logs or results. Only the routing state leaves the machine |
| `systemOne` | `localhost:8009`, 30 s timeout | Any `/v1/systemone` server, including TypeSafe's Jev |
| `policy.threshold` | 0.1 | Below this confidence, apply the default tier. Set from the evaluation's sweep; Kev's confidence runs low by design |
| `policy.margin` | 0 | Leave the current tier only if the proposed tier's probability leads by at least this. 0 disables hysteresis, which lowered agreement in the evaluation |
| `state.budgetTokens` | 8192 | Routing state size; Kev-4B is validated up to 8,192 tokens |

## Known issues

- **Routing adds time to every turn.** Kev re-reads the whole state each turn, at about 0.8 ms per token on an M5 Pro: about 6.5 s at the full 8k budget. It caches only identical states.
- **`opencode run` stalls.** In OpenCode 2.0.30 it intermittently stalls before creating a session. `scripts/oc-run.sh` retries when that happens.
- **`/auto-model` replies arrive late.** They are delivered with the next turn, because OpenCode queues plugin messages.
- **Per-session routing state resets** when OpenCode reloads the plugin.

## Development

```bash
npm test
```

| Path | Contents |
|---|---|
| `src/core` | Configuration, state builder, routers, policy and decision log. Shared by the plugin and the evaluation. |
| `src/plugin` | The OpenCode adapter |
| `src/eval` | Command line tools and the evaluation |
| `openspec/` | The change proposal, specs, design and tasks behind this work |
| `notes/` | Spike reports and the learnings log |

## Licence

[Apache-2.0](LICENSE).
