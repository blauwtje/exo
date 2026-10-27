import assert from 'node:assert/strict';
import test from 'node:test';
import { exportSignatures } from '../lib/export-signatures.mjs';

const cases = [
  ['plain', 'a, b', 2, 2, false],
  ['default', 'a, b = 1', 2, 1, false],
  ['optional', 'a, b?: number', 2, 1, false],
  ['rest', 'a, ...rest', 2, 1, true],
  ['typed default', 'a: Array<string> = []', 1, 0, false],
  ['destructured with inner default', '{ a = 1, b }', 1, 1, false],
  ['destructured with outer default', '{ a, b } = {}', 1, 0, false],
  ['array destructured with inner default', '[a = 1]', 1, 1, false],
  ['arrow-typed parameter', 'callback: (value: number) => void, b', 2, 2, false],
  ['arrow-typed parameter with inner default', 'callback: (value = 1) => void', 1, 1, false],
  ['arrow-typed parameter then default', 'callback: () => void = noop', 1, 0, false],
  ['generic with arrow inside angle brackets', 'map: Map<string, () => void>, b', 2, 2, false],
  ['string default containing equals', 'a = "x=y", b', 2, 1, false],
];

for (const [name, parameters, total, required, hasRest] of cases) {
  test(`parameterShape: ${name}`, () => {
    const shape = exportSignatures(`export function f(${parameters}) {}`).get('f');
    assert.deepEqual({ total: shape.total, required: shape.required, hasRest: shape.hasRest }, { total, required, hasRest });
  });
}
