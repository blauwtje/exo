#!/bin/bash
# SessionStart hook on startup, resume, clear and compact: hand the model the
# body of the route-skills skill, because a skill body is read only when invoked
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
  echo "exo: jq not on PATH, route-skills not injected" >&2
  exit 0
fi
# A clear or a compaction empties the context, so the read guard forgets which
# ranges the model still holds and the repeat guard forgets which calls it saw.
source=$(printf '%s' "$input" | jq -r '.source // ""')
running_plan=""
case "$source" in
  clear|compact)
    printf '%s' "$input" | node "$root/skills/show-savings/scripts/read-guard.mjs" reset >/dev/null
    printf '%s' "$input" | node "$root/skills/show-savings/scripts/repeat-guard.mjs" reset >/dev/null
    # A plan run-plan left open survives only as its marker, so the cleared
    # session is told to resume it instead of waiting for the user to ask.
    running_plan=$(printf '%s' "$input" | node "$root/skills/run-plan/scripts/resume-plan.mjs" session)
    ;;
esac
# Every source ends with the whole body injected below, so the restatement
# measures transcript growth from this point.
printf '%s' "$input" | node "$root/skills/show-savings/scripts/restate.mjs" reset >/dev/null
skill="$root/skills/route-skills/SKILL.md"
[ -f "$skill" ] || exit 0
body=$(awk 'BEGIN { fence = 0 } /^---$/ { fence++; next } fence >= 2 { print }' "$skill")
# Skills read project and global choices, such as where define-scope stores a spec,
# from this one line instead of opening the settings files themselves.
settings=$(node "$root/skills/configure/scripts/settings.mjs" context 2>/dev/null) || settings="exo settings: unresolved, defaults apply"
# A file inside the repository is named from its root, because a full path
# grows with every folder above the checkout; one outside it keeps its full path.
top=""
located() {
  if [ -z "$top" ]; then
    printf '`%s`' "$1"
    return
  fi
  local relative
  relative=$(node -e 'process.stdout.write(require("node:path").relative(process.argv[1], process.argv[2]))' "$top" "$1")
  # A linked worktree keeps its handoff and memory under the main checkout, so
  # the relative path climbs out of the root and only the full path resolves.
  case "$relative" in
    ..*|'')
      printf '`%s`' "$1"
      return
      ;;
  esac
  printf '`%s` from the repository root' "$relative"
}
pointers=""
if [ -n "$running_plan" ]; then
  pointers="$running_plan"$'\n\n'
fi
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
    top=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || top=""
    scope=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
    handoff_file="$git_dir/exo/handoff/$scope.md"
    staleness=" Compare its \`Written:\` commit with \`git rev-parse --short HEAD\`."
  else
    scope=$(basename "$cwd")
    handoff_file="$config_dir/handoff/$scope.md"
  fi
  if [ -f "$handoff_file" ]; then
    pointers="${pointers}A handoff for \`$scope\` sits at $(located "$handoff_file"). Read it only when this session continues that work.$staleness"$'\n\n'
  fi
  # The project memory belongs to the repository rather than to one branch, so
  # it sits in the common git directory a linked worktree shares. Only the
  # pointer is injected: the body is read by the session that needs it.
  memory_file=""
  if memory_dir=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    memory_file="$memory_dir/exo/memory.md"
  else
    memory_file="$config_dir/memory/$(basename "$cwd")/memory.md"
  fi
  if [ -f "$memory_file" ]; then
    pointers="${pointers}A project memory for this repository sits at $(located "$memory_file"). Read it before changing code you have not read here, and run \`/exo:remember\` to change it."$'\n\n'
  fi
fi
# A hook output string over this many characters reaches the model as a file
# path and a 2,000-character preview, which would cut the rules themselves. The
# pointers and the settings line go first and always, so a cut falls on the
# tail of the route-skills body and is named on stderr.
# verify/budgets.mjs holds the same number as HOOK_OUTPUT_CAP.
output_cap=10000
head_text="$pointers$settings"$'\n\n'
room=$((output_cap - ${#head_text}))
if [ "${#body}" -gt "$room" ]; then
  echo "exo: route-skills cut by $((${#body} - room)) characters, the session context would pass $output_cap" >&2
  body="${body:0:room}"
fi
jq -n --arg c "$head_text$body" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
