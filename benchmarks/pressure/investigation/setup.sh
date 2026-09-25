#!/usr/bin/env bash
# Rebuilds the ledger-sync fixture repository the investigation cases read,
# history included, because the cases rely on its commit messages and blame.
set -euo pipefail

root=/tmp/exo-pressure/investigation
stream="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ledger-sync.fast-export"

rm -rf "$root"
mkdir -p "$root/ledger-sync"
cd "$root/ledger-sync"
git init -q -b main
git fast-import --quiet < "$stream"
git reset -q --hard main
echo "ledger-sync rebuilt at $root/ledger-sync"
