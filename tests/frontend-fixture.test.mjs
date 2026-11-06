import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkFixture, defectProblems } from '../benchmarks/frontend-fixture/check.mjs';
import { PROFILES, generate } from '../benchmarks/frontend-fixture/generate.mjs';
import { tempDir } from './harness.mjs';

test('the small profile generates a suite whose seeded defects sit at their listed lines', () => {
  const out = path.join(tempDir(), 'app');
  const { tests } = generate({ out, profile: 'small', seed: 3 });
  assert.equal(tests, PROFILES.small.modules * PROFILES.small.casesPerModule + 1);
  assert.deepEqual(defectProblems(out), []);
  const { problems, suite } = checkFixture(out);
  assert.deepEqual(problems, []);
  assert.equal(suite.tests, tests);
});

test('the same seed generates identical files', () => {
  const first = path.join(tempDir(), 'a');
  const second = path.join(tempDir(), 'b');
  generate({ out: first, seed: 9 });
  generate({ out: second, seed: 9 });
  const read = (root) => fs.readFileSync(path.join(root, 'src/lib/mod3.mjs'), 'utf8');
  assert.equal(read(first), read(second));
});

test('a moved defect is reported', () => {
  const out = path.join(tempDir(), 'app');
  generate({ out });
  fs.writeFileSync(path.join(out, 'src/features/paginate.mjs'), 'export {};\n');
  assert.match(defectProblems(out).join('\n'), /off-by-one-page/);
});
