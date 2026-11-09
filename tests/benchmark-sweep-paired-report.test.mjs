import assert from 'node:assert/strict';
import test from 'node:test';
import { pairedSection } from '../benchmarks/sweep-paired-report.mjs';

const record = (key, arm, fields) => ({ ...key, arm, tokens: 100, costUsd: 1, hiddenPass: true, wallMs: 1000, ...fields });

test('matches arms on id and repeat and reports cand minus base', () => {
  const records = [
    record({ id: 'a', repeat: 1 }, 'base', {}),
    record({ id: 'a', repeat: 1 }, 'cand', { tokens: 90, hiddenPass: false }),
    record({ id: 'a', repeat: 2 }, 'cand', { tokens: 70 }),
    record({ id: 'a', repeat: 2 }, 'base', { tokens: 120 }),
    record({ id: 'b', repeat: 1 }, 'base', {})
  ];
  const text = pairedSection(records);
  assert.match(text, /^## Paired/);
  assert.match(text, /2 pairs/);
  assert.match(text, /- tokens: cand minus base -30\.0000, 95% CI .* \(n=2\)/);
  assert.match(text, /- hidden-check pass: cand minus base -0\.5000/);
  const order = ['tokens', 'cost USD', 'hidden-check pass', 'wall ms'].map((name) => text.indexOf(`- ${name}`));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test('one pair has no interval and unpaired records give nothing', () => {
  const one = pairedSection([record({ id: 'a', repeat: 1 }, 'base', {}), record({ id: 'a', repeat: 1 }, 'cand', {})]);
  assert.match(one, /1 pairs/);
  assert.match(one, /no interval/);
  assert.equal(pairedSection([record({ id: 'a', repeat: 1 }, 'base', {})]), '');
});

test('null metric drops that pair for that metric', () => {
  const text = pairedSection([record({ id: 'a', repeat: 1 }, 'base', { costUsd: null }), record({ id: 'a', repeat: 1 }, 'cand', {})]);
  assert.match(text, /- cost USD: no pair with both values/);
});
