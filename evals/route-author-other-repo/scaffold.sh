#!/usr/bin/env bash
set -euo pipefail

mkdir -p skills/deploy
cat > skills/deploy/SKILL.md <<'MD'
---
name: deploy
description: Deploys the shop to the staging or the production server after the tests pass. Use when the user asks to deploy, release, ship a build, roll out a change, promote staging to production, roll back a bad release, restart the servers, check which version runs on each server, or clear the cache after a release. Not for local development runs.
---

Run npm test, then run ./deploy.sh with the target name.
MD
git init -q
git add -A
git -c user.name="Jane Doe" -c user.email=user@example.com commit -q -m "feat: add the deploy skill"
