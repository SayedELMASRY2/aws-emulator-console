#!/usr/bin/env bash
# Start the AWS Emulator (if it isn't already running) and the web console.
# Ctrl+C stops the console, and the emulator too if this script started it.
set -euo pipefail
cd "$(dirname "$0")"

EMU_PORT="${EMULATOR_PORT:-9297}"
UI_PORT="${UI_PORT:-8297}"
EMU_DIR="$HOME/.aws/emulator/$EMU_PORT"
EMU_BIN="$(command -v aws-emulator || echo "$HOME/.local/bin/aws-emulator")"

healthy() {
  [ -f "$EMU_DIR/ca.pem" ] && curl -fs --max-time 2 --cacert "$EMU_DIR/ca.pem" "https://127.0.0.1:$EMU_PORT/__admin/health" >/dev/null 2>&1
}

venv_python() { if [ -x .venv/bin/python ]; then echo .venv/bin/python; elif [ -x .venv/Scripts/python.exe ]; then echo .venv/Scripts/python.exe; fi; }

if [ -z "$(venv_python)" ]; then
  echo "Setting up Python environment…"
  PY_SYS="$(command -v python3 || command -v python)" || { echo "Python 3.10+ is needed."; exit 1; }
  if command -v uv >/dev/null; then uv venv -q .venv && uv pip install -q --python "$(venv_python)" -r requirements.txt
  else "$PY_SYS" -m venv .venv && "$(venv_python)" -m pip install -q -r requirements.txt; fi
fi
PY="$(venv_python)"

if [ ! -f web/dist/index.html ]; then
  command -v npm >/dev/null || { echo "Node.js/npm is needed to build the console (web/)."; exit 1; }
  echo "Building the web console (first run only)…"
  (cd web && npm install --silent && npm run build --silent)
fi

EMU_PID=""
cleanup() { if [ -n "$EMU_PID" ]; then echo "Stopping emulator…"; kill "$EMU_PID" 2>/dev/null || true; wait "$EMU_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT INT TERM

if healthy; then
  echo "Emulator already running on port $EMU_PORT."
else
  [ -x "$EMU_BIN" ] || {
    echo "The emulator isn't running on port $EMU_PORT and aws-emulator isn't installed."
    echo "Linux: install the package (see README). macOS/Windows: start the emulator container (see README), then run this again."
    exit 1
  }
  mkdir -p logs
  echo "Starting emulator on port $EMU_PORT (log: logs/emulator.log)…"
  EMULATOR_TELEMETRY=off "$EMU_BIN" -p "$EMU_PORT" >logs/emulator.log 2>&1 &
  EMU_PID=$!
  for _ in $(seq 1 60); do healthy && break; sleep 0.5; done
  healthy || { echo "Emulator didn't start. See logs/emulator.log"; exit 1; }
fi

echo "Open http://127.0.0.1:$UI_PORT"
EMULATOR_PORT="$EMU_PORT" UI_PORT="$UI_PORT" "$PY" server.py
