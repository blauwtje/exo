#!/usr/bin/env bash
# Lays down a one-page static site for the design-ui cases under /tmp/exo-pressure/design-ui/.
set -euo pipefail
root=/tmp/exo-pressure/design-ui
rm -rf "$root" && mkdir -p "$root/korst"
cd "$root/korst"
cat > index.html <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Korst</title><link rel="stylesheet" href="style.css"></head>
<body><h1>Korst</h1><p>Coming soon.</p></body></html>
HTML
printf 'body { font-family: sans-serif; }\n' > style.css
git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm init
