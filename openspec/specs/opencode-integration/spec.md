# opencode-integration Specification

## Purpose
Applies the selector's decisions inside OpenCode, so that each user turn and each sub-agent session runs on the chosen tier without the user picking a model by hand.

## Requirements

### Requirement: Routing at each user turn
When a user message is submitted in an OpenCode session, the integration SHALL obtain a routing decision. It SHALL apply the resulting tier's model and thinking setting to the session before that turn's first model request.

#### Scenario: Turn runs on the selected tier
- **WHEN** the user submits a prompt and the selector chooses `large`
- **THEN** the first model request of that turn uses the `large` tier's model and thinking setting

#### Scenario: No switch when tier is unchanged
- **WHEN** the selected tier equals the session's current tier
- **THEN** the integration leaves the session's model unchanged

### Requirement: Routing for sub-agent sessions
When OpenCode starts or resumes a sub-agent session, the integration SHALL route that session's prompt independently of its parent, using the sub-agent's own context.

#### Scenario: Sub-agent routed separately
- **WHEN** a session on the `large` tier hands a simple lookup to a sub-agent
- **THEN** the sub-agent session receives its own decision, which may select a different tier from the parent's

### Requirement: Tier stable within a turn
The integration SHALL NOT change tier between the steps of a single turn, such as between tool calls. A decision applies until the next user message, or until the next sub-agent prompt for a sub-agent session.

#### Scenario: Tool-heavy turn
- **WHEN** a turn makes several tool calls
- **THEN** every model request in that turn uses the tier chosen at its start

### Requirement: Manual override respected
When the user explicitly selects a model for a session, the integration SHALL stop automatic routing for that session until the user re-enables it.

#### Scenario: User picks a model
- **WHEN** the user manually switches the session to a specific model
- **THEN** later turns in that session stay on that model and no routing decisions change it

#### Scenario: Routing disabled by configuration
- **WHEN** automatic routing is disabled in the configuration
- **THEN** the integration makes no decisions and changes no models

### Requirement: Visible routing outcome
The integration SHALL make the active tier visible to the user, so that the user can see which tier handled each turn.

#### Scenario: Tier shown after switch
- **WHEN** the integration switches a session from `medium` to `small`
- **THEN** the session shows that the model changed and which model is now active
