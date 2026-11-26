#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test
cat > src/format.js <<'JS'
export function formatAmount(value, compact = false, signed = false) {
  const text = compact ? String(Math.round(value)) : value.toFixed(2);
  const sign = signed && value > 0 ? '+' : '';
  return sign + '€' + text;
}
JS
cat > src/cart.js <<'JS'
import { formatAmount } from './format.js';

export const cartTotal = (value) => formatAmount(value, true);
JS
cat > src/refund.js <<'JS'
import { formatAmount } from './format.js';

export const refundLine = (value) => formatAmount(value, false, true);
JS
cat > test/format.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAmount } from '../src/format.js';

test('formats an amount', () => {
  assert.equal(formatAmount(5), '€5.00');
});
JS
printf '{"type":"module","scripts":{"test":"node --test"}}\n' > package.json
git init -q
git add -A
git -c user.name="Jane Doe" -c user.email=user@example.com commit -q -m "feat: add the amount format"
