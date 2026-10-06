import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, renderJson, renderText } from '../src/render.mjs';

const summary = [
  { category: 'Hardware', count: 2, total: 1500.5 },
  { category: 'Meals', count: 3, total: 60 },
  { category: 'Travel', count: 1, total: 20.25 }
];

test('formatAmount groups thousands and keeps two decimals', () => {
  assert.equal(formatAmount(1234567.5), '1,234,567.50');
  assert.equal(formatAmount(0), '0.00');
});

test('renderText prints a table with a Total line', () => {
  assert.equal(
    renderText(summary),
    [
      'Category  Count         Total',
      'Hardware      2      1,500.50',
      'Meals         3         60.00',
      'Travel        1         20.25',
      'Total         6      1,580.75',
      ''
    ].join('\n')
  );
});

test('top limits the rows but the Total line covers every category', () => {
  assert.equal(
    renderText(summary, { top: 1 }),
    [
      'Category  Count         Total',
      'Hardware      2      1,500.50',
      '... and 2 more categories',
      'Total         6      1,580.75',
      ''
    ].join('\n')
  );
});

test('renderJson rounds floating point noise to cents and honors top', () => {
  const noisy = [
    { category: 'Hardware', count: 2, total: 1500.5000000000002 },
    { category: 'Meals', count: 3, total: 60 }
  ];
  assert.deepEqual(JSON.parse(renderJson(noisy)), [
    { category: 'Hardware', count: 2, total: 1500.5 },
    { category: 'Meals', count: 3, total: 60 }
  ]);
  assert.equal(JSON.parse(renderJson(noisy, { top: 1 })).length, 1);
  assert.equal(renderJson([]), '[]\n');
});
