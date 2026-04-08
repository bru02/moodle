#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OMA_ROOT="${OMA_ROOT:-$HOME/development/moodleapp}"
LOG_DIR="$ROOT/tmp/compare"
OMA_LOG="$LOG_DIR/oma-web.log"
OMA_PID_FILE="$LOG_DIR/oma-web.pid"
OMA_URL="https://[::1]:8100/login/site"

mkdir -p "$LOG_DIR"

if [[ ! -d "$OMA_ROOT" ]]; then
  echo "Official Moodle app repo not found at $OMA_ROOT" >&2
  exit 1
fi

if [[ -f "$OMA_PID_FILE" ]]; then
  old_pid="$(cat "$OMA_PID_FILE")"
  if [[ -n "${old_pid:-}" ]] && ! kill -0 "$old_pid" 2>/dev/null; then
    rm -f "$OMA_PID_FILE"
  fi
fi

if ! lsof -nP -iTCP:8100 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting OMA web..."
  (
    cd "$OMA_ROOT"
    MOODLE_APP_BROWSER=chrome bun run start -- --no-open
  ) >"$OMA_LOG" 2>&1 &
  echo "$!" >"$OMA_PID_FILE"
fi

for _ in $(seq 1 180); do
  if curl -k --silent --show-error --max-time 5 "$OMA_URL" >/dev/null 2>&1; then
    cat <<EOF
OMA web is ready.

Reference URL:
  https://[::1]:8100

Example:
  agent-browser --session oma --ignore-https-errors open 'https://[::1]:8100'

Log:
  $OMA_LOG
EOF
    exit 0
  fi

  sleep 1
done

echo "Timed out waiting for OMA web at $OMA_URL" >&2
echo "Log: $OMA_LOG" >&2
exit 1
