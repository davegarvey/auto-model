# Spec Delta

## Purpose

Chooses which model tier should handle a request, by asking a System One decision model to pick from a described menu of tiers using the session's recent context.

## ADDED Requirements

### Requirement: Tier menu defined in configuration
The selector SHALL read a menu of tiers from a single configuration file. Each tier has an identifier, a plain-language description of the work it suits, a target model and a thinking setting. The selector SHALL present tiers to the decision model by description only, never by model name.

#### Scenario: Default three-tier menu
- **WHEN** the selector starts with the shipped configuration
- **THEN** the menu contains the tiers `small`, `medium` and `large`, each with a description, target model and thinking setting

#### Scenario: Model changed without code changes
- **WHEN** the user edits the target model of a tier in the configuration and restarts
- **THEN** subsequent decisions for that tier use the new model, and no source change is required

#### Scenario: Invalid configuration
- **WHEN** the configuration lacks a default tier, names a tier twice, or has fewer than two tiers
- **THEN** the selector refuses to start and reports which rule was broken

### Requirement: Decision from a System One model
For each request, the selector SHALL send a state and a `choice` question over the menu to a System One endpoint compatible with `/v1/systemone`. It SHALL take the chosen tier, its confidence and the per-tier probabilities from the response.

#### Scenario: Successful decision
- **WHEN** the endpoint returns a choice of `large` with confidence 0.8
- **THEN** the selector proposes the `large` tier and records confidence 0.8 and the returned probabilities

#### Scenario: Endpoint is configurable
- **WHEN** the configuration sets a different System One base URL or model identifier
- **THEN** the selector sends its requests there without code changes

### Requirement: State built from recent session context
The selector SHALL build its state from the session's recent context, not only the latest prompt: the latest user message, recent turns, a summary of recent tool activity, and the current tier. The state SHALL fit within a configured token budget, which defaults to 8,192 tokens.

#### Scenario: Multi-turn context included
- **WHEN** a session has several earlier turns and the user sends a short follow-up such as "now fix it"
- **THEN** the state contains the earlier turns that give the follow-up its meaning, as well as the follow-up itself

#### Scenario: Long session trimmed to budget
- **WHEN** the recent context exceeds the token budget
- **THEN** the selector drops the oldest material first, keeps the latest user message whole, and the resulting state fits the budget

#### Scenario: Oversized latest message
- **WHEN** the latest user message alone exceeds the budget
- **THEN** the selector truncates it to fit, records that truncation happened, and still produces a decision

### Requirement: Prefix-stable state layout
The selector SHALL order the state so that content carried over from earlier turns keeps its position, and new content is appended after it. This lets the decision model's server reuse work from the previous call.

#### Scenario: Consecutive turns share a prefix
- **WHEN** two consecutive turns occur without trimming
- **THEN** the second turn's state begins with the first turn's carried-over content unchanged

### Requirement: Low-confidence fallback
When the decision's confidence is below a configured threshold, the selector SHALL use the configured default tier instead of the proposed tier.

#### Scenario: Confidence below threshold
- **WHEN** the threshold is 0.5 and the decision proposes `small` with confidence 0.3
- **THEN** the selector uses the default tier and records that the fallback applied

#### Scenario: Confidence at or above threshold
- **WHEN** the threshold is 0.5 and the decision proposes `small` with confidence 0.5
- **THEN** the selector uses `small`

### Requirement: Switch hysteresis
To avoid needless switches, the selector SHALL require a configured margin before leaving the current tier. It leaves only when the proposed tier's probability exceeds the current tier's probability by at least that margin.

#### Scenario: Marginal preference keeps current tier
- **WHEN** the current tier is `medium`, the margin is 0.15, and the probabilities are `large` 0.45 and `medium` 0.40
- **THEN** the selector keeps `medium` and records that hysteresis held the switch

#### Scenario: Clear preference switches tier
- **WHEN** the current tier is `medium`, the margin is 0.15, and the probabilities are `large` 0.70 and `medium` 0.20
- **THEN** the selector switches to `large`

#### Scenario: First turn of a session
- **WHEN** a session has no current tier
- **THEN** hysteresis does not apply and only the confidence fallback is used

### Requirement: Decision model unavailable
When the System One endpoint errors, times out or returns an invalid response, the selector SHALL keep the current tier, or the default tier if there is none. The user's request SHALL NOT be blocked.

#### Scenario: Endpoint down
- **WHEN** the System One server is not running and the user sends a prompt
- **THEN** the request proceeds on the current or default tier, and the failure is recorded

#### Scenario: Endpoint slow
- **WHEN** the endpoint does not answer within the configured timeout, which defaults to 5 seconds
- **THEN** the selector abandons the call and proceeds as for an unavailable endpoint
