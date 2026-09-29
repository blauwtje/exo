#!/usr/bin/env bash
# Places the fixture script both ship prompts run in their empty directory;
# it builds a bare origin and a clone on feat/greeting with one unpushed commit.
set -euo pipefail

root=/tmp/exo-pressure/ship
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$root"
mkdir -p "$root"
cp "$here/make-repo.sh" "$root/make-repo.sh"
chmod +x "$root/make-repo.sh"
echo "fixture script placed in $root"
