#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  jobs -p | xargs -r kill
}
trap cleanup EXIT INT TERM

npm run dev:backend &
npm run dev &

until curl -sSf http://127.0.0.1:5173 >/dev/null; do
  sleep 1
done

APP_MODE=control CONTROL_URL=http://127.0.0.1:8787 VITE_DEV_SERVER_URL=http://127.0.0.1:5173 npm run electron
