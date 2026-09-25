#!/usr/bin/env bash
# Places the fixture script the ship prompt runs in its empty directory.
set -euo pipefail

root=/tmp/exo-pressure/ship
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$root"
mkdir -p "$root"
cp "$here/make-repo.sh" "$root/make-repo.sh"
chmod +x "$root/make-repo.sh"
echo "fixture script placed in $root"
