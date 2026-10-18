# Evaluation dataset

Each entry is labelled with the single tier you would have picked: `small`, `medium` or `large`. Everything here will be published, so include nothing private.

## `prompts.jsonl`: single prompts

One JSON object per line:

```json
{"id": "p01", "text": "What does the --force flag do in our deploy script?", "label": "small"}
{"id": "p02", "text": "Design a retry policy for the webhook sender.", "label": "large", "note": "optional comment"}
```

## `sessions/*.json`: multi-turn sessions

One file per session. Each turn has your message, a summary of the assistant's reply, the tools it used, and your label for that turn.

```json
{
  "id": "flaky-checkout-test",
  "title": "Fixing a flaky checkout test",
  "source": "where the session came from (public repository or task)",
  "turns": [
    {"user": "The checkout test fails one run in ten. Why?", "assistant": "Traced it to a race with the mock server.", "tools": [{"name": "read", "ok": true}], "label": "large"},
    {"user": "now fix it", "assistant": "Added a readiness wait before the first request.", "tools": [{"name": "edit", "ok": true}], "label": "medium"}
  ]
}
```

## Checking

```bash
node src/eval/validate-dataset.ts
```

This rejects unknown labels, duplicate IDs and malformed entries. It also fails if any prompt duplicates one of the embedding router's examples in `data/router-examples.jsonl`.
