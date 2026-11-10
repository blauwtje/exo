import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, '../skills/build/scripts/deal.mjs');

function deal(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('deal.mjs prints two seeds with the same shape and repeats for one seed', () => {
  const first = deal(['--seed', '7']);
  assert.equal(first.status, 0);
  assert.equal(first.stdout.match(/^SEED /gm).length, 2);
  for (const field of ['color', 'type', 'shape', 'density']) {
    assert.equal(first.stdout.match(new RegExp(`^  ${field}: `, 'gm')).length, 2);
  }
  assert.equal(deal(['--seed', '7']).stdout, first.stdout);
});

test('deal.mjs refuses a seed that is not a number with usage and exit 2', () => {
  const ran = deal(['--seed', 'x']);
  assert.equal(ran.status, 2);
  assert.match(ran.stdout, /usage: node deal.mjs/);
});
