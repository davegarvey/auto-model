# Proposal

## Why

The aim is to test, first-hand, the claim that a small "System One" decision model can choose the right model for each request better than an embedding router, and more cheaply than a text-generating LLM. The claim will be tested in a real coding agent over long, multi-turn sessions. The result, favourable or not, feeds a blog post arguing that automatic model selection will replace manual selection, so the experiment must be honest, measurable and reproducible from a public repository.

## What Changes

- Add a model selector that, before each user turn in OpenCode, asks a locally served System One model (Kev-4B, which serves the same `/v1/systemone` API as TypeSafe's Jev) to pick a tier from a three-item menu (small, medium, large). Each tier is described by what it is for, not by model name.
- Map tiers to locally run Ollama models in one config file. The initial mapping:
  - small: `gemma4:e2b-mlx` with thinking off
  - medium: `qwen3.6:35b-mlx` with thinking off
  - large: `qwen3.6:35b-mlx` with thinking on

  The models are illustrative and may be changed without code changes.
- Build the selector's input from recent session context, not only the latest prompt, kept within Kev's validated 8,192-token window. Fall back to a default tier when confidence is low, and avoid needless switches, because a switch can discard the inference server's prompt cache.
- Add an OpenCode v2 plugin that applies the selected tier by switching the session's model, including for sub-agent sessions.
- Log every routing decision: tier, model, confidence, probabilities, latency, state size, and whether a switch happened.
- Add two baselines over the same menu:
  - a nearest-neighbour embedding router using a local Ollama embedding model;
  - a small-LLM router using `gemma4:e2b-mlx` with structured output.
- Add an evaluation script that runs all three routers over the user's labelled prompts and at least one long multi-turn session. It reports:
  - agreement with the user's labels;
  - a confusion matrix of tiers;
  - routing latency;
  - a confidence-threshold sweep;
  - a sweep of state size for the System One router (2k, 4k, 8k and 16k tokens).
- Add a switching cost benchmark. It measures what moving between tiers costs in model load time and prompt reprocessing, for a different model, the same model with thinking toggled, and the same model at another effort level. It compares a two-model, a single-model (effort levels only) and a mixed-family tier design.
- Add an Apache-2.0 licence, a README with setup steps, committed evaluation results, and a short plain-language write-up of findings.
- Begin with two spikes that confirm feasibility before building the rest:
  - that OpenCode applies a plugin's model switch within the same turn;
  - that Kev-4B serves on this Mac with acceptable latency.

Out of scope: hosted or commercial routing services (including Jev itself), containers and packaging, publishing a polished plugin, and large-scale benchmarking.

## Capabilities

### New Capabilities
- `model-routing`: choosing a tier for a request from a described menu using a System One model, including state construction, confidence fallback and switch hysteresis.
- `opencode-integration`: applying routing decisions inside OpenCode sessions, per user turn and for sub-agent sessions.
- `routing-decision-log`: recording each routing decision in a durable, machine-readable form.
- `routing-baselines`: alternative routers (embedding nearest-neighbour and small-LLM) that share the same menu and interface.
- `routing-evaluation`: running routers over a labelled dataset and long sessions, reporting agreement, latency, threshold and state-size results, and benchmarking the cost of switching tiers.

### Modified Capabilities
None. This is a new project with no existing specs.

## Impact

- New TypeScript codebase:
  - a shared routing core;
  - an OpenCode v2 plugin using `@opencode/plugin`;
  - an evaluation command line tool run under Node 24.
- Runtime dependencies, all local:
  - Ollama, for the tier models and the embedding model;
  - Kev's MLX server, run with `uv`;
  - OpenCode v2. Upgrading from 2.0.30 to 2.0.32 is recommended.
- Memory: about 37–41 GB with all tiers and Kev-4B loaded, within the GPU budget of a 64 GB Apple Silicon Mac.
- User configuration: an OpenCode plugin entry and an Ollama provider with tier variants. The user's existing global config is not modified without their agreement.
- Data: the labelled prompts and the long session will be public, so they must contain nothing private.
