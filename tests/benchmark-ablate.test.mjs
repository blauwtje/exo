import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyVariant, buildVariants, pickForRound } from '../benchmarks/ablate.mjs';

const ROOT = new URL('../', import.meta.url).pathname;

test('every variant removes one existing part and counts its lines', () => {
  const variants = buildVariants(ROOT);
  const kinds = new Set(variants.map((variant) => variant.kind));
  assert.deepEqual([...kinds].sort(), ['hook', 'reference', 'rule']);
  for (const variant of variants) {
    assert.equal(variant.remove.length, 1);
    assert.ok(fs.existsSync(path.join(ROOT, variant.remove[0])), variant.id);
    assert.ok(variant.linesRemoved > 0, variant.id);
  }
});

test('variant ids are unique', () => {
  const ids = buildVariants(ROOT).map((variant) => variant.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('one variant per round, wrapping around', () => {
  const variants = buildVariants(ROOT);
  assert.equal(pickForRound(variants, 0), variants[0]);
  assert.equal(pickForRound(variants, variants.length + 1), variants[1]);
  assert.equal(pickForRound([], 3), null);
});

test('applying a variant removes only its file from a copy', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ablate-'));
  fs.mkdirSync(path.join(copy, 'hooks'));
  fs.writeFileSync(path.join(copy, 'hooks', 'a.mjs'), 'x\n');
  fs.writeFileSync(path.join(copy, 'hooks', 'b.mjs'), 'y\n');
  applyVariant(copy, { remove: ['hooks/a.mjs'] });
  assert.deepEqual(fs.readdirSync(path.join(copy, 'hooks')), ['b.mjs']);
});
