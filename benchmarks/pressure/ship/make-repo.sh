#!/usr/bin/env bash
# Builds, in the current directory, a bare `origin.git` and a clone `app` on
# branch feat/greeting holding one finished, unpushed commit.
set -euo pipefail

git init -q --bare -b main origin.git
git init -q -b main app
cd app
git config user.email pressure@example.com
git config user.name pressure
printf 'console.log("hi");\n' > greet.js
git add greet.js
git commit -qm "chore: initial commit"
git remote add origin ../origin.git
git push -q -u origin main
git switch -qc feat/greeting
printf 'console.log("hello, world");\n' > greet.js
git commit -qam "feat(greet): greet the whole world"
echo "repository ready in $(pwd) on feat/greeting, one commit ahead of origin"
