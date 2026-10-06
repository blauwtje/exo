#!/usr/bin/env bash
# Installs exo in one command: clones it into ~/.exo, or pulls that clone when
# it is already there, then runs the clone's install.mjs.
#
#   curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --harness codex --yes
#
# Every argument passes through to install.mjs. `EXO_DIR` sets the clone folder
# (default ~/.exo), `EXO_REPO` the clone source (default the GitHub repository).
# It needs git and Node 22 or newer and checks both before it writes anything.
# A folder at `EXO_DIR` that is not a git clone is refused, never replaced.
# Under `curl | bash` stdin is this script, so install.mjs reads its prompts from
# /dev/tty; with no terminal at all it takes the defaults.
# The body is one function called on the last line, so a cut-off download runs nothing.

set -eu

fail() {
  printf 'exo: %s\n' "$1" >&2
  exit 1
}

install_exo() {
  exo_dir="${EXO_DIR:-$HOME/.exo}"
  exo_repo="${EXO_REPO:-https://github.com/blauwtje/exo}"

  command -v git >/dev/null 2>&1 || fail "git is missing; install git, then run this again."
  command -v node >/dev/null 2>&1 || fail "Node.js is missing; install Node.js 22 or newer from https://nodejs.org, then run this again."
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  case "$major" in '' | *[!0-9]*) major=0 ;; esac
  [ "$major" -ge 22 ] || fail "Node.js $(node --version 2>/dev/null || echo '(unknown version)') is too old; install Node.js 22 or newer from https://nodejs.org, then run this again."

  if [ -e "$exo_dir/.git" ]; then
    echo "Updating exo in $exo_dir"
    git -C "$exo_dir" pull -q --ff-only || fail "could not update $exo_dir with git pull --ff-only; resolve it there, then run this again."
  elif [ -e "$exo_dir" ]; then
    fail "$exo_dir exists but is not a git clone; move it away or set EXO_DIR to another folder, then run this again."
  else
    echo "Cloning exo into $exo_dir"
    git clone -q --depth 1 "$exo_repo" "$exo_dir" || fail "could not clone $exo_repo into $exo_dir."
  fi

  if [ ! -t 0 ] && (exec </dev/tty) 2>/dev/null; then
    node "$exo_dir/install.mjs" "$@" </dev/tty
  else
    node "$exo_dir/install.mjs" "$@"
  fi
}

install_exo "$@"
