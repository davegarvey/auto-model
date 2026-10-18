# routing-baselines Specification

## Purpose
Provides alternative routers over the same tier menu, so that the System One selector can be compared fairly against the established approaches: embedding classification, and a text-generating LLM used as a router.

## Requirements

### Requirement: Common router interface
Every router SHALL accept the same inputs, the menu and the session state, and return a tier, a confidence between 0 and 1, and per-tier scores where available. Any router SHALL be usable by the evaluation and by the OpenCode integration without other changes.

#### Scenario: Swapping routers
- **WHEN** the configuration names the embedding router instead of the System One router
- **THEN** evaluation and live routing both use the embedding router, with the same fallback and logging behaviour

### Requirement: Embedding nearest-neighbour router
The system SHALL provide a router that embeds the state with a locally served embedding model. It SHALL choose the tier by similarity to a set of labelled example prompts, and the example set SHALL be separate from the evaluation set.

#### Scenario: Classifies by nearest examples
- **WHEN** the state is most similar to examples labelled `small`
- **THEN** the router returns `small`, with a confidence derived from the similarity scores

#### Scenario: Same context window as the selector
- **WHEN** the router is given a multi-turn state
- **THEN** it embeds the same state, with the same recent turns, that the System One router receives, not only the latest prompt

#### Scenario: No overlap with evaluation data
- **WHEN** the evaluation runs
- **THEN** no evaluation prompt also appears in the embedding router's example set, and the evaluation fails if one does

### Requirement: Small-LLM router
The system SHALL provide a router that asks a small, locally served text-generating model to choose a tier from the same menu descriptions, returning structured output.

#### Scenario: Valid structured answer
- **WHEN** the model returns a valid tier
- **THEN** the router returns that tier, with a confidence taken from the model's output or a documented default

#### Scenario: Malformed answer
- **WHEN** the model returns output that does not name a valid tier
- **THEN** the router reports an invalid response, which the caller handles as an unavailable router

### Requirement: Baselines measured like the selector
Baselines SHALL report the same latency and token usage fields as the System One router, so that their results are directly comparable.

#### Scenario: Comparable records
- **WHEN** each router makes a decision on the same state
- **THEN** each decision log record contains latency and token usage fields with the same names and units
