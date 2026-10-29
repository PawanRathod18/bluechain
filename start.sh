#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 run.py
elif command -v python >/dev/null 2>&1; then
  exec python run.py
else
  echo "Python was not found. Install Python 3.12 and try again."
  exit 1
fi
