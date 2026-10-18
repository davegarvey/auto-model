# routing-evaluation Specification

## Purpose
Measures how well each router matches the user's own tier choices, and at what latency. The results are reproducible and can be published alongside the code.

## Requirements

### Requirement: Labelled dataset format
The evaluation SHALL read a dataset of single-prompt cases and multi-turn sessions from version-controlled files. Each case or turn SHALL carry the tier the user would have picked. A multi-turn session provides a label for each user turn.

#### Scenario: Single-prompt case
- **WHEN** the dataset contains a prompt labelled `medium`
- **THEN** the evaluation scores each router's choice for that prompt against `medium`

#### Scenario: Multi-turn session
- **WHEN** the dataset contains a session of 15 user turns, each labelled
- **THEN** each router is evaluated at every turn using the state that turn would produce in live routing

#### Scenario: Invalid label
- **WHEN** a case names a tier that is not in the menu
- **THEN** the evaluation refuses to run and reports the case

### Requirement: Agreement report
For each router, the evaluation SHALL report:
- overall agreement with the labels;
- agreement on single prompts and on multi-turn turns, separately;
- a confusion matrix of labelled tier against chosen tier.

#### Scenario: Report produced
- **WHEN** the evaluation completes over three routers
- **THEN** the report shows, for each router, its overall, single-prompt and multi-turn agreement, and its confusion matrix

### Requirement: Latency and cost report
For each router, the evaluation SHALL report median and 95th-percentile routing latency, total routing tokens, and estimated routing cost.

#### Scenario: Latency summary
- **WHEN** the evaluation completes
- **THEN** each router's median and p95 latency, in milliseconds, appear in the report

### Requirement: Confidence threshold sweep
The evaluation SHALL report, for each router, agreement and fallback rate at a range of confidence thresholds. This lets the live threshold be chosen from data.

#### Scenario: Sweep output
- **WHEN** the evaluation runs a sweep from 0.0 to 0.9 in steps of 0.1
- **THEN** the report lists, for each threshold, the agreement after fallback and the share of decisions that fell back

### Requirement: State size sweep
The evaluation SHALL run the System One router at state budgets of 2,048, 4,096, 8,192 and 16,384 tokens on the multi-turn sessions, and report agreement at each budget.

#### Scenario: Effect of context measured
- **WHEN** the state-size sweep completes
- **THEN** the report shows multi-turn agreement for each budget, so that the effect of more context is visible

### Requirement: Simulated hysteresis on sessions
The evaluation SHALL apply the configured fallback and hysteresis rules over each multi-turn session, as live routing would. It SHALL report agreement and the number of tier switches, with and without hysteresis.

#### Scenario: Switch count
- **WHEN** a 15-turn session is evaluated
- **THEN** the report gives the number of switches each router would make, with and without hysteresis, alongside its agreement

### Requirement: Switching cost benchmark
The evaluation SHALL measure the cost of moving between tiers. For each transition type and context size, it SHALL report time to first token, split into model load time and prompt processing time, and the number of prompt tokens reprocessed.

#### Scenario: Transition types measured
- **WHEN** the benchmark runs
- **THEN** it measures five transitions:
  - same model and same setting (the baseline);
  - same model with thinking toggled;
  - same model with a named effort level changed;
  - a different model that is already loaded;
  - a different model that is not loaded.

#### Scenario: Context sizes measured
- **WHEN** the benchmark runs
- **THEN** each transition is measured at contexts of about 2,048, 8,192 and 32,768 tokens, built from the same text

#### Scenario: Tier designs compared
- **WHEN** the benchmark runs
- **THEN** it reports the switching costs of three tier designs side by side:
  - the shipped two-model design;
  - a single-model design whose tiers are effort levels of one model;
  - a design that mixes model families.

#### Scenario: Runs independently of routing
- **WHEN** the user runs only the switching cost benchmark
- **THEN** it completes without any router or labelled dataset, and writes its results to the run directory

### Requirement: Reproducible, publishable results
The evaluation SHALL write its report and the per-decision records to files intended for version control. The report SHALL state:
- the versions of the decision model and of each tier model;
- the router configuration;
- the dataset revision;
- the date of the run.

#### Scenario: Rerun on another machine
- **WHEN** a reader runs the evaluation with the same pinned models and dataset
- **THEN** the report records every version needed to compare their results with the published ones
