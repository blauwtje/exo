#!/usr/bin/env bash
set -euo pipefail

[ "$PWD" = "$HOME/cwd" ] || exit 0
mkdir -p "$HOME/../config"
printf '{"outputStyle":"exo:adhd"}\n' > "$HOME/../config/settings.json"
