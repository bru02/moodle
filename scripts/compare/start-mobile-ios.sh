#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$ROOT/tmp/compare"
METRO_LOG="$LOG_DIR/mobile-metro.log"
BRIDGE_LOG="$LOG_DIR/mobile-ipv4-bridge.log"
BRIDGE_PID_FILE="$LOG_DIR/mobile-ipv4-bridge.pid"
METRO_PID_FILE="$LOG_DIR/mobile-metro.pid"
AUTO_OPEN="${AUTO_OPEN:-1}"

BUNDLE_URL="http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&transform.reactCompiler=true&unstable_transformProfile=hermes-stable"
DEV_CLIENT_URL="exp+mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"

mkdir -p "$LOG_DIR"

cleanup_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
    fi
  fi
}

wait_for_port() {
  local seconds="$1"
  for _ in $(seq 1 "$seconds"); do
    if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for Metro to listen on port 8081." >&2
  exit 1
}

warm_ios_bundle() {
  echo "Warming the iOS bundle through 127.0.0.1:8081..."
  curl --fail --silent --show-error --max-time 120 -o /dev/null "$BUNDLE_URL"
}

open_dev_client() {
  local booted
  booted="$(xcrun simctl list devices | awk '/Booted/ { print $NF; exit }')"

  if [[ -z "$booted" ]]; then
    echo "No booted iOS simulator found; skipping automatic Expo deep link open."
    return 0
  fi

  echo "Opening Expo dev client URL in the booted simulator..."
  xcrun simctl openurl booted "$DEV_CLIENT_URL"
}

cleanup_pid_file "$METRO_PID_FILE"
cleanup_pid_file "$BRIDGE_PID_FILE"

if ! lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting Metro..."
  (
    cd "$ROOT"
    bun run --cwd apps/mobile start -- --dev-client --host localhost
  ) >"$METRO_LOG" 2>&1 &
  echo "$!" >"$METRO_PID_FILE"
fi

wait_for_port 30

if ! lsof -nP -iTCP:8081 -sTCP:LISTEN | grep -q '127\.0\.0\.1:8081'; then
  echo "Starting IPv4 bridge on 127.0.0.1:8081..."
  socat 'TCP4-LISTEN:8081,bind=127.0.0.1,reuseaddr,fork' 'TCP6:[::1]:8081' >"$BRIDGE_LOG" 2>&1 &
  echo "$!" >"$BRIDGE_PID_FILE"
  sleep 1
fi

warm_ios_bundle

open -a Simulator

if [[ "$AUTO_OPEN" != "0" ]]; then
  open_dev_client
fi

cat <<EOF
Mobile compare target is ready.

OMA reference URL:
  https://[::1]:8100

Local Metro URLs:
  chooser entry: http://[::1]:8081
  simulator bridge: http://127.0.0.1:8081
  Expo dev-client deep link: $DEV_CLIENT_URL

Next step:
  If the app did not foreground automatically:
  npx agent-device --session moodle-ios --session-lock strip open me.toldy.moodle --platform ios

Logs:
  $METRO_LOG
  $BRIDGE_LOG
EOF
