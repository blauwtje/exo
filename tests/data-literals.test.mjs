import assert from 'node:assert/strict';
import test from 'node:test';
import { dataLiterals, literalFinder, literalFragments, textPresence } from '../lib/data-literals.mjs';
import { gitRepository } from './harness.mjs';

test('the finder finds a tracked path and a text inside a tracked file, and refuses an absent literal', async () => {
  const root = await gitRepository({ 'src/widget.mjs': 'export const marker = "quartz-lantern";\n' });
  const found = literalFinder(root, null);
  assert.equal(found('src/widget.mjs'), true);
  assert.equal(found('quartz-lantern'), true);
  assert.equal(found('src/absent-file.mjs'), false);
  assert.equal(textPresence(root, null)('quartz-lantern'), true);
  assert.equal(textPresence(root, null)('nothing-here-at-all'), false);
});

test('the fragment split drops <...> and ... and pieces under 3 characters', () => {
  assert.deepEqual(literalFragments('src/<name>/run.mjs'), ['src/', '/run.mjs']);
  assert.deepEqual(literalFragments('alpha...omega'), ['alpha', 'omega']);
  assert.deepEqual(literalFragments('a bc def'), ['def']);
});

test('the Data extraction returns each backticked literal', () => {
  assert.deepEqual(dataLiterals('uses `a/b.mjs` and `c d`, not plain prose'), ['a/b.mjs', 'c d']);
});
