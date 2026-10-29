import assert from 'node:assert/strict';
import test from 'node:test';
import { outOfScope } from '../skills/improve/scripts/scope.mjs';

const cfg = (scope, readOnly = []) => ({ scope, readOnly });

test('a file inside the scope passes', () => assert.equal(outOfScope(['src/x.js'], cfg(['src'])), null));

test('a file outside the scope and a read-only file are named', () => {
  assert.match(outOfScope(['lib/y.js'], cfg(['src'])), /file out of scope: lib\/y\.js/);
  assert.match(outOfScope(['src/score.js'], cfg(['src'], ['src/score.js'])), /file out of scope: src\/score\.js/);
});

test('a glob scope entry matches files, a bare directory keeps matching its tree', () => {
  const scope = cfg(['src/*.ts', 'docs']);
  assert.equal(outOfScope(['src/parse.ts'], scope), null);
  assert.equal(outOfScope(['docs/a/b.md'], scope), null);
  assert.match(outOfScope(['src/deep/parse.ts'], scope), /out of scope/);
  assert.match(outOfScope(['src/parse.js'], scope), /out of scope/);
});

test('a trailing-star scope entry does not cover files below its directory', () => {
  assert.equal(outOfScope(['src/b.ts'], cfg(['src/*'])), null);
  assert.match(outOfScope(['src/deep/a.ts'], cfg(['src/*'])), /out of scope/);
});

test('a bracket class in a scope entry matches as git pathspec does', () => {
  assert.equal(outOfScope(['src/x1.ts'], cfg(['src/x[0-9].ts'])), null);
  assert.match(outOfScope(['src/xa.ts'], cfg(['src/x[0-9].ts'])), /out of scope/);
});

test('a scope entry git refuses is a message, not a stack trace', () => {
  assert.match(outOfScope(['src/a.ts'], cfg(['../outside'])), /^scope check failed: /);
});
