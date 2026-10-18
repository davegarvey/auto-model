#!/usr/bin/env bash
# Runs `opencode run` with a start-up watchdog. OpenCode 2.0.30's CLI intermittently stalls before it creates a
# session (observed on roughly every other run); if no session event arrives within START_TIMEOUT seconds the
# attempt is killed and retried. Output (JSON events) goes to stdout.
set -uo pipefail
START_TIMEOUT="${START_TIMEOUT:-25}"
ATTEMPTS="${ATTEMPTS:-4}"
for attempt in $(seq 1 "$ATTEMPTS"); do
  out="$(mktemp)"
  opencode run --format json "$@" > "$out" 2>&1 &
  pid=$!
  started=0
  for _ in $(seq 1 "$START_TIMEOUT"); do
    if grep -q '"sessionID"' "$out" 2>/dev/null; then started=1; break; fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if [ "$started" = 1 ] || ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid"; status=$?
    cat "$out"; rm -f "$out"
    exit "$status"
  fi
  echo "oc-run: no session after ${START_TIMEOUT}s (attempt $attempt), retrying" >&2
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; rm -f "$out"
done
echo "oc-run: gave up after $ATTEMPTS attempts" >&2
exit 1
