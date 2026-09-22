// pick-reviewer.mjs picks the branch-review agent by the size of the change,
// and only a named --reviewer override moves the pick off that reading.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShortstat, pickReviewer, resolveReviewer } from '../skills/implementing/scripts/pick-reviewer.mjs';
import { UsageError } from '../lib/script-flags.mjs';

test('parses files, insertions and deletions out of a shortstat line', () => {
  assert.deepEqual(parseShortstat(' 3 files changed, 9 insertions(+), 1 deletion(-)'), { files: 3, changedLines: 10 });
  assert.deepEqual(parseShortstat(' 16 files changed, 384 insertions(+)'), { files: 16, changedLines: 384 });
  assert.deepEqual(parseShortstat(''), { files: 0, changedLines: 0 });
});

test('picks the plain reviewer at or under both limits', () => {
  assert.equal(pickReviewer({ files: 5, changedLines: 200 }), 'exo:branch-reviewer');
  assert.equal(pickReviewer({ files: 1, changedLines: 1 }), 'exo:branch-reviewer');
});

test('picks the deep reviewer above either limit', () => {
  assert.equal(pickReviewer({ files: 6, changedLines: 1 }), 'exo:branch-reviewer-deep');
  assert.equal(pickReviewer({ files: 1, changedLines: 201 }), 'exo:branch-reviewer-deep');
});

test('a named override wins over the diff reading', () => {
  assert.equal(resolveReviewer({ reviewer: 'exo:branch-reviewer', shortstatOutput: ' 16 files changed, 384 insertions(+)' }), 'exo:branch-reviewer');
  assert.equal(resolveReviewer({ reviewer: 'exo:branch-reviewer-deep', shortstatOutput: ' 1 file changed, 1 insertion(+)' }), 'exo:branch-reviewer-deep');
});

test('an unnamed reviewer in the override is rejected', () => {
  assert.throws(() => resolveReviewer({ reviewer: 'budget is tight', shortstatOutput: '' }), UsageError);
});

test('with no override, the diff reading decides', () => {
  assert.equal(resolveReviewer({ reviewer: undefined, shortstatOutput: ' 3 files changed, 9 insertions(+), 1 deletion(-)' }), 'exo:branch-reviewer');
  assert.equal(resolveReviewer({ reviewer: undefined, shortstatOutput: ' 16 files changed, 384 insertions(+)' }), 'exo:branch-reviewer-deep');
});
