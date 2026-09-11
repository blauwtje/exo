#!/bin/bash
# SessionStart hook on startup, clear and compact: hand the model the body of
# the using-exo skill, because a skill body is read only when invoked and this
# one says when to invoke the others. The frontmatter is dropped; the
# descriptions already sit in context.
input=$(cat)
root="$(cd "$(dirname "$0")/.." && pwd)"
# The installed copy lives under a versioned cache path, so the status line
# and the skills reach the scripts through this pointer instead of a path that
# rots per bump.
config_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo"
mkdir -p "$config_dir" && printf '%s\n' "$root" > "$config_dir/plugin-root"
# A clear or a compaction empties the context, so the read guard forgets which
# ranges the model still holds.
source=$(printf '%s' "$input" | jq -r '.source // ""')
case "$source" in
  clear|compact) printf '%s' "$input" | node "$root/skills/savings/scripts/read-guard.mjs" reset ;;
esac
skill="$root/skills/using-exo/SKILL.md"
[ -f "$skill" ] || exit 0
body=$(awk 'BEGIN { fence = 0 } /^---$/ { fence++; next } fence >= 2 { print }' "$skill")
# With exo savings off the ladder is not borrowed either; the sentence that
# borrows it is dropped from the injected body.
if [ "$(node "$root/skills/savings/scripts/savings.mjs" status 2>/dev/null)" = "off" ]; then
  body=$(printf '%s\n' "$body" | sed 's/; `right-sizing` is borrowed before the first edit that adds or replaces code, every time and without being asked//')
fi
jq -n --arg c "$body" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
