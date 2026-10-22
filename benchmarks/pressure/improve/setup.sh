#!/usr/bin/env bash
set -euo pipefail

root=/tmp/exo-pressure/improve
rm -rf "$root" "$root.baseline"
mkdir -p "$root"
cd "$root"

git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"

printf 'node_modules/\n.exo/\n' > .gitignore

cat > score.mjs <<'J'
import { compress, decompress } from './solve.mjs';

const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
const sample = Array.from({ length: 400 }, (_, i) => `${words[i % 5]}-${i % 17}`).join(' ');

const packed = Buffer.from(compress(sample));
if (decompress(packed) !== sample) {
  console.error('round trip failed');
  process.exit(1);
}
console.log(`score: ${packed.length}`);
J

cat > solve.mjs <<'J'
export function compress(text) {
  return Buffer.from(text, 'utf8');
}

export function decompress(bytes) {
  return Buffer.from(bytes).toString('utf8');
}
J

git add -A
git commit -q -m "feat(compress): add identity baseline"
node score.mjs | sed 's/^score: //' > "$root.baseline"
echo "improve fixture ready: $root (baseline $(cat "$root.baseline"))"
