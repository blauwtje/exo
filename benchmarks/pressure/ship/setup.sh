#!/usr/bin/env bash
# Places the fixture script both ship prompts run in their empty directory;
# it builds a bare origin and a clone on feat/greeting with one unpushed commit.
# Also places a stand-in `gh` in bin/, which case2 puts first on PATH so ship
# sees a signed-in GitHub account and offers its full route menu.
set -euo pipefail

root=/tmp/exo-pressure/ship
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$root"
mkdir -p "$root/bin"
cp "$here/make-repo.sh" "$root/make-repo.sh"
cp "$here/fake-gh.sh" "$root/bin/gh"
chmod +x "$root/make-repo.sh" "$root/bin/gh"
echo "fixture script placed in $root; stand-in gh in $root/bin"
