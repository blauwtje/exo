#!/usr/bin/env bash
# Places the per-case fixture scripts where the refactor prompts run them:
# each prompt starts in an empty directory and runs one of these scripts there.
set -euo pipefail

root=/tmp/exo-pressure/refactor
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$root"
mkdir -p "$root"
for fixture in setup-billing.sh setup-dates.sh setup-notify.sh setup-quote.sh; do
  cp "$here/$fixture" "$root/$fixture"
  chmod +x "$root/$fixture"
done
echo "fixture scripts placed in $root"
