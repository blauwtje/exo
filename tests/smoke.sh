#!/usr/bin/env bash
# Headless smoke test: a session started on this tree must list the plugin's
# skills under the exo: namespace. Needs a logged-in claude on PATH; not part of
# node --test because it calls a model.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
claude -p --plugin-dir "$root" 'List the names of the skills available to you, one per line, nothing else.' \
  | grep -q 'exo:' && echo "smoke: exo skills visible"
