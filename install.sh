#!/usr/bin/env bash
# Installs, updates or removes exo in one command, with no git or node to type.
#
#   Install: curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash
#   Update:  curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --update
#   Remove:  curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --remove
#
# Install clones exo into ~/.exo, or pulls that clone when it is already there,
# then runs the clone's install.mjs. Update pulls the clone once, then runs
# install.mjs --update with --pulled, so the pulled adapters run without a
# second pull. Remove never clones or pulls: it runs install.mjs --remove, then
# deletes the clone only when no harness still records an install and the clone
# holds no uncommitted, untracked or unpushed work; otherwise it says why the
# clone stayed. Every argument passes through to install.mjs, such as
# `--harness codex` or `--yes`.
#
# `EXO_DIR` sets the clone folder (default ~/.exo), `EXO_REPO` the clone source
# (default the GitHub repository). It needs git and Node 22 or newer and checks
# both before it writes anything. A folder at `EXO_DIR` that is not a git clone
# is refused, never replaced.
# Under `curl | bash` stdin is this script, so install.mjs reads its prompts from
# /dev/tty; with no terminal at all it takes the defaults.
# The body is one function called on the last line, so a cut-off download runs nothing.

set -eu

INSTALL_LINE='curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash'

fail() {
  printf 'exo: %s\n' "$1" >&2
  exit 1
}

# Runs the clone's install.mjs, reading prompts from the terminal when stdin is not one.
run_installer() {
  if [ ! -t 0 ] && (exec </dev/tty) 2>/dev/null; then
    node "$exo_dir/install.mjs" "$@" </dev/tty
  else
    node "$exo_dir/install.mjs" "$@"
  fi
}

# Prints why the clone must stay, or nothing when it may be deleted.
why_clone_stays() {
  left="$(node "$exo_dir/install.mjs" --recorded 2>&1)" || { echo "the install records could not be read: $left"; return; }
  [ -z "$left" ] || { echo "${left//$'\n'/, } still records an install"; return; }
  [ -z "$(git -C "$exo_dir" status --porcelain 2>&1)" ] || { echo "it has uncommitted or untracked changes"; return; }
  ahead="$(git -C "$exo_dir" rev-list --count '@{upstream}..HEAD' 2>/dev/null)" || { echo "it has no upstream to compare its commits with"; return; }
  [ "$ahead" = 0 ] || echo "it has $ahead commit(s) missing from its upstream"
}

install_exo() {
  exo_dir="${EXO_DIR:-$HOME/.exo}"
  exo_repo="${EXO_REPO:-https://github.com/blauwtje/exo}"
  mode=install
  for arg in "$@"; do
    case "$arg" in
      --update) mode=update ;;
      --remove) mode=remove ;;
    esac
  done

  if [ "$mode" != install ] && [ ! -e "$exo_dir/.git" ]; then
    [ "$mode" = remove ] || fail "exo is not installed in $exo_dir; install it with: $INSTALL_LINE"
    echo "exo is not installed in $exo_dir"
    return 0
  fi

  command -v git >/dev/null 2>&1 || fail "git is missing; install git, then run this again."
  command -v node >/dev/null 2>&1 || fail "Node.js is missing; install Node.js 22 or newer from https://nodejs.org, then run this again."
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  case "$major" in '' | *[!0-9]*) major=0 ;; esac
  [ "$major" -ge 22 ] || fail "Node.js $(node --version 2>/dev/null || echo '(unknown version)') is too old; install Node.js 22 or newer from https://nodejs.org, then run this again."

  if [ "$mode" = remove ]; then
    run_installer "$@" || fail "the remove did not finish, so $exo_dir stays; fix the error above, then run this again."
    reason="$(why_clone_stays)"
    if [ -n "$reason" ]; then
      echo "Kept $exo_dir: $reason."
    else
      rm -rf "$exo_dir"
      echo "Deleted $exo_dir"
    fi
    return 0
  fi

  if [ -e "$exo_dir/.git" ]; then
    echo "Updating exo in $exo_dir"
    git -C "$exo_dir" pull -q --ff-only || fail "could not update $exo_dir with git pull --ff-only; resolve it there, then run this again."
  elif [ -e "$exo_dir" ]; then
    fail "$exo_dir exists but is not a git clone; move it away or set EXO_DIR to another folder, then run this again."
  else
    echo "Cloning exo into $exo_dir"
    git clone -q --depth 1 "$exo_repo" "$exo_dir" || fail "could not clone $exo_repo into $exo_dir."
  fi

  if [ "$mode" = update ]; then
    run_installer "$@" --pulled
  else
    run_installer "$@"
  fi
}

install_exo "$@"
