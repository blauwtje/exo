#!/bin/bash
# PreToolUse guard on Read: deny a full read of large text files so that Claude
# uses offset/limit (context budget). Binary/media files and reads that already
# pass a limit/offset are let through.
input=$(cat)
f=$(jq -r '.tool_input.file_path // empty' <<<"$input")
lim=$(jq -r '.tool_input.limit // .tool_input.offset // empty' <<<"$input")
[ -z "$f" ] || [ -n "$lim" ] || [ ! -f "$f" ] && exit 0
case "${f##*.}" in
  png|jpg|jpeg|gif|webp|pdf|ipynb|svg|ico|woff|woff2|ttf) exit 0 ;;
esac
lines=$(($(wc -l < "$f" 2>/dev/null || echo 0)))
bytes=$(($(wc -c < "$f" 2>/dev/null || echo 0)))
# A byte cap beside the line cap: long-line markdown and minified files pass
# the 300-line rule and still cost 3k+ tokens per read. Skill and reference
# files under ~/.claude and the skills source tree are exempt from the byte
# cap: a skill reads its reference whole by design, and chunking it costs
# more turns for the same tokens.
max_bytes=${READ_GUARD_MAX_BYTES:-12000}
case "$f" in
  */.claude/*|*/claude-skills/*) max_bytes=0 ;;
esac
if [ "$lines" -gt 300 ]; then
  reason="File has $lines lines (>300)."
elif [ "$max_bytes" -gt 0 ] && [ "$bytes" -gt "$max_bytes" ]; then
  reason="File has $bytes bytes (>$max_bytes, about $((bytes / 4)) tokens)."
else
  exit 0
fi
jq -n --arg r "$reason Locate the range first — Grep for text/logs, or Grep the symbol definition and its references for code — then Read only that range via offset/limit." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
