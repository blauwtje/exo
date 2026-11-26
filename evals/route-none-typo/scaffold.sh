#!/usr/bin/env bash
set -euo pipefail

cat > README.md <<'MD'
# tinyshop

A small cart library. Call `total(items)` to sum the prices of the items.

Subscribers recieve a mail when an order ships.
MD
