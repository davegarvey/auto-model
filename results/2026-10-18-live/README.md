# Live OpenCode session

One OpenCode 2.0.30 session on this repository with the selector live (Kev, threshold 0.1, margin 0), driven through `scripts/oc-run.sh`. `decisions.jsonl` is the plugin's decision log for it, unedited.

Turns sent:
1. "What does scripts/oc-run.sh do? Answer in two sentences, without editing anything." Routed to small (0.63), switched from the default.
2. "Read src/core/policy.ts and reason carefully: is there any sequence of router outputs where hysteresis holds a tier even though the router is confident it is wrong? …" Routed to large (0.11), switched.
3. "Thanks. Which licence does this repository use? One word." Routed to small (0.26), switched back.

The two extra `large` records at 12:32:34 and 12:32:58 are the second turn arriving again: `opencode run` stalled twice before reporting a session, and the watchdog's retries re-sent the prompt, which the service had already accepted. They held the tier, so `switched` is false.
