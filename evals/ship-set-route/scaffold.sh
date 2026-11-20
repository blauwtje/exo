#!/usr/bin/env bash
set -euo pipefail

bash "$(dirname "$0")/../scaffold.sh" pressure ship setup.sh make-repo.sh

if [ "$PWD" = "$HOME/cwd" ]; then
  printf '%s\n' 'export CLAUDE_PLUGIN_OPTION_SHIP=push' > "$PWD/../.zshenv"
fi
