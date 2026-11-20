#!/usr/bin/env bash
set -euo pipefail

git init -q
mkdir -p src
cat > package.json <<'JSON'
{
  "name": "tinyshop",
  "version": "1.0.0",
  "type": "module",
  "main": "src/cart.js"
}
JSON
cat > src/cart.js <<'JS'
export function total(items) {
  return items.reduce((sum, item) => sum + item.cents, 0);
}
JS
printf 'node_modules\n' > .gitignore
git add -A
git -c user.name=Jane -c user.email=jane@example.com commit -q -m "feat(fixture): add the cart"
