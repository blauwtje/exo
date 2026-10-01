// exportSignatures reads each exported function's parameter list by pattern:
// a comment outside quotes is no part of the source, and a `<` or `>` is a
// generic bracket only when it follows an identifier.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportSignatures } from '../lib/export-signatures.mjs';

function shape(source, name) {
  const { total, required, hasRest } = exportSignatures(source).get(name);
  return { total, required, hasRest };
}

test('a plain list reads its total and required counts', () => {
  assert.deepEqual(shape('export function f(a, b = 1, ...rest) {}', 'f'), { total: 3, required: 1, hasRest: true });
});

test('a comment holding a bracket or comma inside the list is ignored', () => {
  const source = 'export function f(a, // the (first\n  b /* x, y ) */, c) {}';
  assert.deepEqual(shape(source, 'f'), { total: 3, required: 3, hasRest: false });
});

test('a commented-out export declares nothing', () => {
  assert.equal(exportSignatures('// export function f(a) {}\n/*\nexport function g(a) {}\n*/\n').size, 0);
});

test('a block comment before an export keeps the export on its own line', () => {
  assert.deepEqual(shape('/* note\nmore */\nexport function f(a) {}', 'f'), { total: 1, required: 1, hasRest: false });
});

test('comment markers inside a quoted default stay put', () => {
  const source = "export function f(url = 'http://x', b = '/* y */') {}";
  assert.deepEqual(shape(source, 'f'), { total: 2, required: 0, hasRest: false });
});

test('a generic type keeps its commas together', () => {
  assert.deepEqual(shape('export function f(a: Map<string, number>, b) {}', 'f'), { total: 2, required: 2, hasRest: false });
});

test('a comparison in a default opens no generic', () => {
  assert.deepEqual(shape('export function f(a = x < y, b = 1) {}', 'f'), { total: 2, required: 0, hasRest: false });
});

test('a greater-than in a default closes nothing', () => {
  assert.deepEqual(shape('export function f(a = x > 1, b) {}', 'f'), { total: 2, required: 1, hasRest: false });
});
