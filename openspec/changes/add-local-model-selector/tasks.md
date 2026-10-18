# Tasks

## 1. Repository setup and feasibility spikes

- [ ] 1.1 Add an Apache-2.0 `LICENSE`, a `.gitignore` (ignoring `vendor/` and `node_modules/`, but not `results/`), and a `package.json` with `"type": "module"` and Node ≥ 24. Verify that `node --version` satisfies the engines field and that `git status` shows only the intended files.
- [ ] 1.2 Spike: write a throwaway v2 plugin that calls `ctx.session.switchModel` from `session.hook("prompt")` to move from `ollama/qwen3.6:35b-mlx#none` to `ollama/gemma4:e2b-mlx#none`, load it from the project `opencode.json`, and send one prompt. Verify from the Ollama request log, or `ollama ps`, that the same turn's first request used the new model. Record the outcome and the OpenCode version in `notes/spike-switch.md`. If it fails, test the `aisdk.hook("language")` fallback and record that instead.
- [ ] 1.3 Spike: add `scripts/serve-kev.sh` (pinned Kev commit, `uv sync --extra serve`, `jaredpalmer/kev-4b@v1.0`, port 8009) and send one `choice` question over three tier descriptions with `curl`. Verify a valid response with `choice`, `confidence` and `probabilities`. Record cold and warm latency, and peak memory with Kev and both Ollama models loaded, in `notes/spike-kev.md`.

## 2. Routing core: configuration and state

- [ ] 2.1 Implement loading and validation of `auto-model.config.json`: tiers, default tier, router choice, endpoints, threshold, margin, state budget, timeout, log path and capture flag. Ship the default three-tier config. Verify with unit tests (`node --test`) covering valid config, duplicate tier, missing default and fewer than two tiers.
- [ ] 2.2 Implement the state builder: field order, oldest-first trimming to the budget, truncation of an oversized latest message, and the characters ÷ 3.5 token estimate. Verify with unit tests for the multi-turn inclusion, trimming, oversized-message and prefix-stability scenarios in the model-routing spec.
- [ ] 2.3 Implement the decision log writer (JSON Lines, append-only, reason codes, state capture flag). Verify with unit tests that one valid line is written per record, that concurrent writes stay separate lines, and that state text is absent unless capture is on.

## 3. Routing core: System One router and policy

- [ ] 3.1 Implement the `/v1/systemone` client with timeout and response validation, and the System One router behind the common router interface. Verify with unit tests against a stubbed HTTP server: success, error status, timeout and malformed body.
- [ ] 3.2 Implement the policy (endpoint error, confidence fallback, hysteresis margin, first-turn rule) as a pure function. Verify with unit tests for every policy scenario in the model-routing spec.
- [ ] 3.3 Add a small command line tool, `node src/eval/route-once.ts "<prompt>"`, that routes one prompt through the core against the live Kev server and prints the decision and log record. Verify by running it against Kev with one obviously simple and one obviously hard prompt.

## 4. OpenCode plugin

- [ ] 4.1 Implement the plugin: prompt hook, state from session messages, router call, policy, `switchModel` with variant, warm-up call at start-up, and decision logging. Add the project `opencode.json` with the Ollama provider, tier variants and plugin entry. Verify in OpenCode that a simple prompt runs on `small` and a hard one on `large`, and that `decisions.jsonl` gains matching records.
- [ ] 4.2 Implement manual override detection and the `/auto-model on|off|status` command. Verify in OpenCode that a hand-picked model stays for later turns, and that `/auto-model on` resumes routing.
- [ ] 4.3 Verify sub-agent routing: ask for a task that spawns a sub-agent, and check that the child session has its own decision record, with the parent's session identifier, and runs on its own tier.
- [ ] 4.4 Verify behaviour when Kev is down: stop Kev, send a prompt, and confirm the turn proceeds on the current or default tier with reason `endpoint-error`, and with no added delay beyond the timeout.
- [ ] 4.5 Write the README sections for setup (OpenCode version, model pulls, Kev script, plugin loading) and usage. Verify by following them from a fresh shell to a routed turn.

## 5. Baselines

- [ ] 5.1 Write `data/router-examples.jsonl`, about 10 labelled examples per tier, for the user to review. Verify that the user has approved them and that a check script finds no overlap with the evaluation data.
- [ ] 5.2 Implement the embedding router (Ollama `embeddinggemma`, cosine k-nearest neighbours with k = 5, weighted vote confidence). Verify with a unit test using stubbed embeddings, and with `route-once` using `--router embedding`.
- [ ] 5.3 Implement the small-LLM router (`gemma4:e2b-mlx`, JSON-schema `format`, thinking off, malformed-output handling). Verify with a unit test for malformed output, and with `route-once` using `--router llm`.

## 6. Evaluation dataset

- [ ] 6.1 Define the dataset formats (`data/eval/prompts.jsonl` and `data/eval/sessions/*.json`), with a validator that rejects unknown labels. Verify with unit tests for valid and invalid labels.
- [ ] 6.2 Load the user's roughly 20 labelled prompts into `data/eval/prompts.jsonl`. Verify that the validator passes and that the user confirms the content can be published.
- [ ] 6.3 Record at least one long multi-turn OpenCode session on public material, convert it to the session format, and have the user label each turn. Verify that the validator passes, that there are at least 15 labelled turns, and that the user confirms the content can be published.

## 7. Evaluation runner and report

- [ ] 7.1 Implement the evaluation runner: all routers over prompts and sessions, agreement with Wilson intervals, confusion matrices, median and p95 latency, tokens and cost. Verify with a unit test on a fixture dataset with stubbed routers and known expected numbers.
- [ ] 7.2 Add the confidence-threshold sweep, the state-size sweep (2k, 4k, 8k and 16k tokens) and the session hysteresis simulation (switch counts with and without hysteresis). Verify with fixture tests in which the expected switch counts and sweep rows are known.
- [ ] 7.3 Write `report.md`, `report.json` and `decisions.jsonl` to `results/<date>-<shortsha>/`, with model versions, configuration, dataset revision and date. Verify that a fixture run produces all three files and that the metadata fields are present.
- [ ] 7.4 Implement the switching cost benchmark (`src/eval/switch-cost.ts`):
  - five transition types;
  - contexts of about 2k, 8k and 32k tokens, cut from the recorded session text;
  - the two-model, single-model (`gpt-oss:20b` effort levels) and mixed-family designs;
  - the median of three runs;
  - load and prompt processing times read from Ollama's responses.

  It runs on its own and writes `switch-cost.md` and `switch-cost.json` to the run directory. Verify with a unit test using stubbed Ollama responses, and with one live run at 2k context whose same-setting baseline shows a reused cache: prompt processing well below the cold case.

## 8. Experiment run and write-up

- [ ] 8.1 Run the full evaluation on the real dataset with all routers loaded locally, plus the full switching cost benchmark, and commit the results directory. Verify that both reports are complete and that the routing numbers match a spot check of `decisions.jsonl`.
- [ ] 8.2 Set the live threshold and margin from the sweep results in `auto-model.config.json`. Verify by rerunning `route-once` with the new values.
- [ ] 8.3 Run one real OpenCode session with the selector live, and keep its decision log in the results directory. Verify that the log shows per-turn decisions and switches.
- [ ] 8.4 Write `WRITEUP.md`, a plain-language account covering:
  - what worked and what didn't;
  - what was harder than expected;
  - switching costs;
  - Kev's context limit;
  - whether the results support the thesis, citing the committed results.

  Verify that every figure in it traces to a file in `results/`.

## Workflow follow-up

- Review the change with the user, then archive it with `/opsx:archive`.
- Publishing the repository to GitHub is the user's step, after reviewing that the data and logs contain nothing private.
