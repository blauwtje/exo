#!/usr/bin/env bash
# Headless smoke test: a session started on this tree must list the plugin's
# skills under the exo: namespace. Needs a logged-in claude on PATH; not part of
# node --test because it calls a model.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# Ten of the eleven skills the model may invoke, so one name the model drops
# from its list does not fail the run while a missing plugin still does.
minimum=10
listed=$(claude -p --plugin-dir "$root" 'List the names of the skills available to you, one per line, nothing else.' \
  | grep -cE '^[-*[:space:]]*exo:' || true)
if [ "$listed" -lt "$minimum" ]; then
  echo "smoke: $listed exo: skills listed, expected at least $minimum" >&2
  exit 1
fi
echo "smoke: $listed exo skills visible"
