#!/usr/bin/env bash
# Places setup-textkit.sh where case7-small-plan.txt runs it: the prompt starts
# in an empty directory and runs that script there. The script appends
# `textkit <checkout path>` to checkouts.log, so a grader finds the scratch
# checkout of every run; the path names the arm, since pressure.mjs creates it
# as pressure-with-*, pressure-without-* or pressure-main-*.
# It then lays down one checkout in a scratch directory, runs plan-check on its
# plan, pastes every task's code and runs `npm test`, so a clean setup proves
# the plan is valid and lands green, and prints the route next-task picks.
set -euo pipefail

root=/tmp/exo-pressure/build
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills="$here/../../../skills"

rm -rf "$root"
mkdir -p "$root"
: > "$root/checkouts.log"
cp "$here/setup-textkit.sh" "$root/setup-textkit.sh"
chmod +x "$root/setup-textkit.sh"

# Self-check on a scratch checkout; its log line and origin are removed after,
# so checkouts.log names only the case runs.
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
(cd "$scratch" && bash "$root/setup-textkit.sh" > /dev/null)
: > "$root/checkouts.log"
rm -rf "$root"/textkit-origin-*
plan="$scratch/docs/plans/string-helpers.md"
if ! checked="$(node "$skills/spec/scripts/plan-check.mjs" --plan "$plan" --root "$scratch" 2>&1)"; then
  printf 'setup-small-plan.sh: plan-check rejected the plan:\n%s\n' "$checked" >&2
  exit 1
fi
route="$(cd "$scratch" && node "$skills/build/scripts/next-task.mjs" --plan "$plan" --root "$scratch" | grep '^Route:' || true)"

# Each task's first js block is its test, the second its module, in Files: order.
node --input-type=module - "$plan" "$scratch" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const [plan, root] = process.argv.slice(2);
const sections = fs.readFileSync(plan, 'utf8').split(/^### Task \d+:/m).slice(1);
for (const section of sections) {
  const [module, test] = [...section.matchAll(/^- (?:Create|Test): `([^`]+)`$/gm)].map((match) => match[1]);
  const [testCode, moduleCode] = [...section.matchAll(/^```js\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
  fs.writeFileSync(path.join(root, test), testCode);
  fs.writeFileSync(path.join(root, module), moduleCode);
}
NODE
(cd "$scratch" && npm test --silent > /dev/null 2>&1) \
  || { echo "setup-small-plan.sh: npm test fails with every task's pasted code in place" >&2; exit 1; }

echo "fixture script placed in $root; the plan passes plan-check and lands green; next-task prints ${route:-no Route: line}"
