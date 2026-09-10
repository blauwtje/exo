#!/bin/bash
# SessionStart hook on startup, clear and compact: hand the model the body of
# the using-exo skill, because a skill body is read only when invoked and this
# one says when to invoke the others. The frontmatter is dropped; the
# descriptions already sit in context.
root="$(cd "$(dirname "$0")/.." && pwd)"
skill="$root/skills/using-exo/SKILL.md"
[ -f "$skill" ] || exit 0
body=$(awk 'BEGIN { fence = 0 } /^---$/ { fence++; next } fence >= 2 { print }' "$skill")
jq -n --arg c "$body" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
