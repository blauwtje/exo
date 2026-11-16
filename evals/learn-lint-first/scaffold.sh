#!/usr/bin/env bash
set -euo pipefail

git init -q
mkdir -p src
cat > package.json <<'JSON'
{
  "name": "tinyshop",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "lint": "node lint.mjs"
  }
}
JSON
cat > lint.mjs <<'JS'
import fs from 'node:fs';
import path from 'node:path';

const rules = [
  { name: 'eqeqeq', pattern: /[^=!]==[^=]|!=[^=]/ }
];

const files = fs.readdirSync('src', { recursive: true }).filter((name) => name.endsWith('.js'));
let failed = false;
for (const name of files) {
  const lines = fs.readFileSync(path.join('src', name), 'utf8').split('\n');
  lines.forEach((text, index) => {
    for (const rule of rules) {
      if (!rule.pattern.test(text)) continue;
      console.error(`src/${name}:${index + 1} ${rule.name}`);
      failed = true;
    }
  });
}
process.exit(failed ? 1 : 0);
JS
cat > src/cart.js <<'JS'
export function total(items) {
  console.log('total called', items.length);
  return items.reduce((sum, item) => sum + item.cents, 0);
}
JS
printf 'node_modules\n' > .gitignore
git add -A
git -c user.name=Jane -c user.email=jane@example.com commit -q -m "feat(fixture): add the cart"
