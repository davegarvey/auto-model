# Spec Delta

## Purpose

Records every routing decision as a durable, machine-readable entry, so that decisions can be audited, analysed and cited in the published results.

## ADDED Requirements

### Requirement: One record per decision
For every routing decision, made live in OpenCode or during evaluation, the system SHALL append one JSON object per line to a decision log file. Records SHALL be appended and never rewritten.

#### Scenario: Decision appended
- **WHEN** a routing decision completes
- **THEN** exactly one new line containing a valid JSON object is appended to the log

#### Scenario: Concurrent sessions
- **WHEN** two sessions make decisions at the same time
- **THEN** both records are written as separate, complete lines

### Requirement: Decision record contents
Each record SHALL include:
- a timestamp, and the session identifier, with the parent's identifier for sub-agents;
- the router name, plus the decision model's identifier and the version it reports;
- the proposed tier, the applied tier and the target model;
- the confidence, and the per-tier probabilities where the router provides them;
- the routing latency in milliseconds, and the state size in tokens and in characters;
- whether the state was truncated, and whether a switch occurred.

#### Scenario: Live decision record
- **WHEN** the selector chooses `large` with confidence 0.72 in 640 ms and switches from `medium`
- **THEN** the record contains router, proposed tier `large`, applied tier `large`, confidence 0.72, the probabilities, latency 640, the state size, and `switched: true` with previous tier `medium`

### Requirement: Reason for the applied tier
Each record SHALL state why the applied tier was chosen, as exactly one of:
- `decision`
- `low-confidence-fallback`
- `hysteresis-hold`
- `endpoint-error`
- `manual-override`

#### Scenario: Fallback recorded
- **WHEN** low confidence causes the default tier to be applied
- **THEN** the record's reason is `low-confidence-fallback` and both the proposed and applied tiers are present

### Requirement: Routing cost recorded
Each record SHALL include the routing call's token usage, as reported by the decision model or router. Where a monetary price is configured for that router, the record SHALL also include its estimated cost; with no price configured, the cost is zero.

#### Scenario: Local router with no price
- **WHEN** a decision is made by the local System One server with no price configured
- **THEN** the record includes input token usage and an estimated cost of 0

### Requirement: Privacy-safe by default
Decision records SHALL NOT contain the state text or prompt text unless state capture is explicitly enabled in configuration.

#### Scenario: Default logging
- **WHEN** state capture is not enabled
- **THEN** records contain sizes and decisions but no prompt or state content

#### Scenario: Capture enabled for evaluation
- **WHEN** state capture is enabled
- **THEN** each record also includes the state that was sent to the router
