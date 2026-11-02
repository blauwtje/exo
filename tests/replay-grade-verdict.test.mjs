import assert from 'node:assert/strict';
import test from 'node:test';
import { readVerdict } from '../benchmarks/replay/grade.mjs';

const OUTPUT = 'The cache is kept between builds.';

test('a pass or fail verdict needs evidence that is a verbatim substring of the answer', () => {
  assert.deepEqual(readVerdict('{"grade":"pass","evidence":"The cache is kept"}', OUTPUT), { grade: 'pass', evidence: 'The cache is kept' });
  assert.deepEqual(readVerdict('{"grade":"fail","evidence":"kept between builds."}', OUTPUT), { grade: 'fail', evidence: 'kept between builds.' });
  assert.equal(readVerdict('{"grade":"pass","evidence":"the cache stays"}', OUTPUT).grade, 'unknown');
  assert.equal(readVerdict('{"grade":"pass","evidence":""}', OUTPUT).grade, 'unknown');
});

test('a reply that is not JSON or names another grade is unknown', () => {
  assert.deepEqual(readVerdict('no idea', OUTPUT), { grade: 'unknown', evidence: 'judge reply not JSON' });
  assert.equal(readVerdict('{"grade":"maybe","evidence":"The cache"}', OUTPUT).grade, 'unknown');
});

test('a judge that reports unknown is an unknown grade, the same grade a bad reply gets', () => {
  assert.deepEqual(readVerdict('{"grade":"unknown","evidence":""}', OUTPUT), { grade: 'unknown', evidence: 'judge reported not enough information' });
});
