#!/usr/bin/env bash
set -euo pipefail

exo_root="${EXO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
git init -q
printf '{\n  "name": "notes-app",\n  "version": "1.0.0",\n  "type": "module"\n}\n' > package.json
printf 'export const title = "notes";\n' > index.js
printf 'node_modules\n.claude-home\n.claude\n' > .gitignore
git add -A
git -c user.name=Jane -c user.email=jane@example.com commit -q -m "feat(fixture): add the notes app"

home="$PWD/.claude-home"
real="$(pwd -P)"
folder="$home/projects/$(printf '%s' "$real" | sed 's/[^A-Za-z0-9]/-/g')"
mkdir -p "$folder" .claude
printf '{\n  "env": {\n    "CLAUDE_CONFIG_DIR": "%s"\n  }\n}\n' "$home" > .claude/settings.json

wishes=(
  "Commit messages in plain text with no emoji please, I keep asking for this."
  "Again, write commit messages as plain text, no emoji, I keep asking for this."
  "No emoji in commit messages, plain text only, I keep asking for this."
  "Run the unit tests before you say the work is finished, and show me the output."
  "You said it was finished without running the unit tests, run them and show me the output."
  "Before you call the work finished, run the unit tests and show me the output."
  "Ask me before you delete any files, and list what you plan to remove first."
  "You deleted files without asking, ask me before you delete and list what you plan to remove first."
  "Always list what you plan to remove and ask me before you delete any files."
)

for index in "${!wishes[@]}"; do
  number=$((index + 1))
  session="$(printf '00000000-0000-4000-8000-%012d' "$number")"
  day="$(printf '2026-10-%02d' $((number + 5)))"
  file="$folder/$session.jsonl"
  : > "$file"
  for step in 0 1 2 3 4 5 6 7; do
    text="Please look at item $((number * 10 + step)) in the report."
    [ "$step" -eq 3 ] && text="${wishes[$index]}"
    printf '{"type":"user","timestamp":"%sT09:%02d:00.000Z","message":{"role":"user","content":"%s"}}\n' "$day" "$step" "$text" >> "$file"
  done
done

CLAUDE_CONFIG_DIR="$home" node "$exo_root/skills/learn/scripts/corrections.mjs" backfill --cwd "$real"
