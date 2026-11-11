import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFigures } from '../benchmarks/lean-guards-compare.mjs';

const baseline = JSON.parse(
  readFileSync(new URL('../benchmarks/results/lean-guards-baseline.json', import.meta.url), 'utf8'),
);

test('baseline holds the three figures', () => {
  assert.deepEqual(Object.keys(baseline).sort(), ['bytes', 'hookMs', 'modules']);
});

test('equal figures are all ok', () => {
  assert.ok(compareFigures(baseline, baseline).every((row) => row.ok));
});

test('a larger figure is flagged with its delta', () => {
  const rows = compareFigures(baseline, { ...baseline, modules: baseline.modules + 2 });
  const modules = rows.find((row) => row.figure === 'modules');
  assert.equal(modules.ok, false);
  assert.equal(modules.delta, 2);
});

const script = fileURLToPath(new URL('../benchmarks/lean-guards-compare.mjs', import.meta.url));

test('no argument measures this checkout and passes', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 60000, env: { ...process.env, EXO_HOOK_EXTRA_MS: '60000' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 3);
});

test('a figures file with larger bytes or modules exits 1', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lean-guards-'));
  for (const figure of ['bytes', 'modules']) {
    const file = path.join(dir, `${figure}.json`);
    writeFileSync(file, JSON.stringify({ ...baseline, [figure]: baseline[figure] + 1 }));
    const result = spawnSync(process.execPath, [script, file], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 1, figure);
  }
});
