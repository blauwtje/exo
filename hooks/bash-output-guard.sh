#!/bin/bash
# PreToolUse guard on Bash: cap the output of a short allowlist of known-verbose
# build and test commands, so a full test log does not enter the context window.
#
# Anything containing a pipe, redirect, command chain or substitution is passed
# through untouched. That exclusion is deliberate: an earlier rewriting hook in
# this setup broke such commands silently -- `ps | grep` returned nothing at all.
# This guard must never rewrite a command.
input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
[ -z "$cmd" ] && exit 0

# Byte cap on whole-file reads through the shell (cat, sed, head), the Bash
# counterpart of read-guard.sh. It runs before the pipe exclusion below because
# it only denies and never rewrites, so a chained command is safe to inspect.
verdict=$(printf '%s' "$input" | python3 "$(dirname "$0")/bash-read-cap.py" 2>/dev/null)
if [ -n "$verdict" ]; then
  printf '%s\n' "$verdict"
  exit 0
fi

case "$cmd" in
  *"|"*|*">"*|*"<"*|*"&"*|*";"*|*'`'*|*'$('*) exit 0 ;;
esac

# The patterns match on prefix, so every runner form has to be spelled out: a
# bare `pytest` and `uv run pytest` are different strings, and `git -C <dir> log`
# does not start with `git log`. An earlier version listed only the bare forms
# and silently let `git -C ~/.local/share/chezmoi log` through at full length.
case "$cmd" in
  "npm test"*|"npm run test"*|"npm run build"*|"pnpm test"*|"pnpm build"*|\
  "yarn test"*|"bun test"*|\
  "pytest"*|"python -m pytest"*|"python3 -m pytest"*|"uv run pytest"*|\
  "go test"*|"cargo test"*|"cargo build"*|"cargo clippy"*|\
  "dotnet test"*|"dotnet build"*|\
  "tsc"*|"npx tsc"*|\
  "git log"*|"git -C "*" log"*|"git shortlog"*) ;;
  *) exit 0 ;;
esac

# `set -o pipefail` keeps the command's own exit status instead of tail's, so a
# failing test run still reports as failed after the output is truncated.
capped="set -o pipefail; $cmd 2>&1 | tail -n 200"

jq -n --arg c "$capped" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:{command:$c}}}'
