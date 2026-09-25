#!/usr/bin/env bash
# Builds, in the current directory, a repository `app` on main with a
# one-task plan under docs/plans/.
set -euo pipefail

git init -q -b main app
cd app
git config user.email pressure@example.com
git config user.name pressure
mkdir -p docs/plans
printf 'console.log("hi");\n' > greet.js
cat > docs/plans/greeting.md <<'PLAN'
# Greeting plan

Goal: greet.js greets the whole world.
Repository: .

### Task 1: widen the greeting

- Modify: `greet.js`
Change `hi` to `hello, world` in greet.js.
Verify: `node greet.js` prints `hello, world`.
PLAN
git add .
git commit -qm "chore: initial commit"
echo "repository ready in $(pwd) on main"
