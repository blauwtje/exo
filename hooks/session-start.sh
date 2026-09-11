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
# While exo savings are on, the right-sizing ladder and its guards ride in this
# same context string, so they hold before every edit without a skill call and
# are booked with the rest of exo's session text; with savings off they stay out.
ladder_skill="$root/skills/right-sizing/SKILL.md"
if [ -f "$ladder_skill" ] && [ "$(node "$root/skills/savings/scripts/savings.mjs" status 2>/dev/null)" != "off" ]; then
  ladder=$(awk '/^## Report$/ { exit } /^## The ladder$/ { keep = 1 } keep { print }' "$ladder_skill")
  body=$(printf '%s\n\n# Right-sizing\n\nWhile exo savings are on, this ladder holds before every edit that adds or replaces code; it needs no call to `right-sizing`.\n\n%s' "$body" "$ladder")
fi
jq -n --arg c "$body" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
