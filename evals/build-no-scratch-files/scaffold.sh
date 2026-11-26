#!/usr/bin/env bash
set -euo pipefail
mkdir -p src test
cat > package.json <<'JSON'
{
  "name": "sums",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "test": "node --test" }
}
JSON
cat > src/sum.js <<'JS'
export function sum(values) {
  return values.reduce((total, value) => total + value, 1);
}
JS
cat > test/sum.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sum } from '../src/sum.js';

test('sum adds the values', () => {
  assert.equal(sum([1, 2, 3]), 6);
});
JS
git init -q
git add -A
git -c user.name="Jane Doe" -c user.email=user@example.com commit -q -m "feat(sum): add sum"
