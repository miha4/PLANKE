#!/usr/bin/env bash
set -euo pipefail

CONTROL_URL_VALUE="${CONTROL_URL:-}"
DEVICE_ID_VALUE="${DEVICE_ID:-player-01}"

cleanup() {
  jobs -p | xargs -r kill
}
trap cleanup EXIT INT TERM

npm run dev &

until curl -sSf http://127.0.0.1:5173 >/dev/null; do
  sleep 1
done

APP_MODE=player CONTROL_URL="$CONTROL_URL_VALUE" DEVICE_ID="$DEVICE_ID_VALUE" VITE_DEV_SERVER_URL=http://127.0.0.1:5173 npm run electron
