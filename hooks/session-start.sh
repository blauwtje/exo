#!/bin/bash
# SessionStart hook on startup, resume, clear and compact: hand the model the
# body of the using-exo skill, because a skill body is read only when invoked
# and this one says when to invoke the others and carries the right-sizing
# ladder. The frontmatter is dropped; the descriptions already sit in context.
input=$(cat)
root="$(cd "$(dirname "$0")/.." && pwd)"
# The installed copy lives under a versioned cache path, so the status line
# and the skills reach the scripts through this pointer instead of a path that
# rots per bump; a resumed session can run a newer copy than it started on.
config_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo"
mkdir -p "$config_dir" && printf '%s\n' "$root" > "$config_dir/plugin-root"
# Without jq the hook can neither read the source nor write the injection; the
# pointer above is already written, so it stops here and says why.
if ! command -v jq >/dev/null; then
  echo "exo: jq not on PATH, using-exo not injected" >&2
  exit 0
fi
# A clear or a compaction empties the context, so the read guard forgets which
# ranges the model still holds and the repeat guard forgets which calls it saw.
source=$(printf '%s' "$input" | jq -r '.source // ""')
case "$source" in
  clear|compact)
    printf '%s' "$input" | node "$root/skills/savings/scripts/read-guard.mjs" reset >/dev/null
    printf '%s' "$input" | node "$root/skills/savings/scripts/repeat-guard.mjs" reset >/dev/null
    ;;
esac
# Every source ends with the whole body injected below, so the restatement
# measures transcript growth from this point.
printf '%s' "$input" | node "$root/skills/savings/scripts/restate.mjs" reset >/dev/null
skill="$root/skills/using-exo/SKILL.md"
[ -f "$skill" ] || exit 0
body=$(awk 'BEGIN { fence = 0 } /^---$/ { fence++; next } fence >= 2 { print }' "$skill")
# Skills read project and global choices, such as where shaping stores a spec,
# from this one line instead of opening the settings files themselves.
settings=$(node "$root/skills/settings/scripts/settings.mjs" context 2>/dev/null) || settings="exo settings: unresolved, defaults apply"
body="$body"$'\n\n'"$settings"
# A handoff the user wrote before a clear sits beside the branch it belongs to,
# so a session resuming that work is told where it is instead of searching for
# it. Only the pointer is injected: the file itself is often longer than this
# whole body, and most sessions here are not the one it was written for.
cwd=$(printf '%s' "$input" | jq -r '.cwd // ""')
if [ -n "$cwd" ]; then
  # The commit sentence is added only inside a repository, where the reader has
  # a HEAD to compare the file against.
  staleness=""
  if git_dir=$(git -C "$cwd" rev-parse --absolute-git-dir 2>/dev/null); then
    scope=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
    handoff_file="$git_dir/exo/handoff/$scope.md"
    staleness=" On reading it, compare the commit on its \`Written:\` line with \`git rev-parse --short HEAD\` and say so when they differ."
  else
    scope=$(basename "$cwd")
    handoff_file="$config_dir/handoff/$scope.md"
  fi
  if [ -f "$handoff_file" ]; then
    body="$body"$'\n\n'"A handoff for \`$scope\` sits at \`$handoff_file\`. Read it only when this session continues that work.$staleness"
  fi
  # The project memory belongs to the repository rather than to one branch, so
  # it sits in the common git directory a linked worktree shares. Only the
  # pointer is injected: the body is read by the session that needs it, and the
  # hook's own output ceiling has no room for a second file.
  memory_file=""
  if memory_dir=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    memory_file="$memory_dir/exo/memory.md"
  else
    memory_file="$config_dir/memory/$(basename "$cwd")/memory.md"
  fi
  if [ -f "$memory_file" ]; then
    body="$body"$'\n\n'"A project memory for this repository sits at \`$memory_file\`. Read it before changing code you have not read here, and run \`/exo:memory\` to change it."
  fi
fi
jq -n --arg c "$body" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
