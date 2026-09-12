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
# ranges the model still holds.
source=$(printf '%s' "$input" | jq -r '.source // ""')
case "$source" in
  clear|compact) printf '%s' "$input" | node "$root/skills/savings/scripts/read-guard.mjs" reset ;;
esac
skill="$root/skills/using-exo/SKILL.md"
[ -f "$skill" ] || exit 0
body=$(awk 'BEGIN { fence = 0 } /^---$/ { fence++; next } fence >= 2 { print }' "$skill")
jq -n --arg c "$body" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
