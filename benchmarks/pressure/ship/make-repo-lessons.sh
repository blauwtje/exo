#!/usr/bin/env bash
# The make-repo.sh repository plus one lesson two sessions booked under one
# review key, so `memory.mjs propose --count` prints 1 inside `app`.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$here/make-repo.sh"
mkdir -p app/.git/exo
cat > app/.git/exo/memory.json <<JSON
{
  "candidates": {
    "review:hard-coded-text@greet.js": [
      { "session": "s1", "date": "2026-01-01", "quote": null, "claim": "Text shown to users is never hard-coded in the source file.", "source": "review" },
      { "session": "s2", "date": "2026-01-02", "quote": null, "claim": "Greeting text stays out of the code that prints it.", "source": "review" }
    ]
  },
  "lines": []
}
JSON
