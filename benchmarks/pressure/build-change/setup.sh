#!/usr/bin/env bash
# Places the per-case fixture scripts where the build-change prompts run them:
# each prompt starts in an empty directory and runs one of these scripts there.
# Each fixture script appends `<fixture> <checkout path>` to checkouts.log, so
# a grader finds the scratch checkout of every run; the path names the arm,
# since pressure.mjs creates it as pressure-with-* or pressure-without-*.
set -euo pipefail

root=/tmp/exo-pressure/build-change
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$root"
mkdir -p "$root"
: > "$root/checkouts.log"
for fixture in setup-orders.sh setup-shop.sh setup-invoices.sh; do
  cp "$here/$fixture" "$root/$fixture"
  chmod +x "$root/$fixture"
done
echo "fixture scripts placed in $root"
