import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkBaselineHonesty } from '../verify/checks/baseline-honesty.mjs';
import { tempDir } from './harness.mjs';

const TABLE = [
  '| Cell | a | b | c | d | Tokens | Wall | Cost | Detail |',
  '|---|---|---|---|---|---|---|---|---|',
  '| flow | 1 | 1 | 1 | 1 | 100 | 10 | $0.5 | 0/4 Plan-task trailers, hidden check pass |',
  '| flow | 1 | 1 | 1 | 1 | 100 | 10 | $0.5 | 4/4 Plan-task trailers, hidden check pass |',
];
const VERDICTS = ['- flow: ok', '  - Verdict: cost +0 : ok', '  - Verdict: wall +0 : ok', '  - Verdict: tokens +0 : ok'];

function withResults(lines) {
  const root = tempDir('honesty-');
  const folder = path.join(root, 'benchmarks', 'results');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'x.md'), [...TABLE, '', ...lines].join('\n'));
  return checkBaselineHonesty(root);
}

test('a complete section passes', () => {
  const lines = ['## Comparison with the baseline', 'Baseline: a.md @ abc', 'Excluded: baseline row 3, candidate row 1', ...VERDICTS];
  assert.deepEqual(withResults(lines), []);
});

test('a file without the section passes', () => {
  assert.deepEqual(withResults(['nothing']), []);
});

test('a missing baseline, exclusion and verdicts are flagged', () => {
  const problems = withResults(['## Comparison with the baseline', 'Excluded: none']).join('\n');
  assert.match(problems, /no Baseline/);
  assert.match(problems, /does not name candidate row 1/);
  assert.match(problems, /no Verdict: line for tokens/);
});

test('a longer row number does not satisfy a bypassed row', () => {
  const lines = ['## Comparison with the baseline', 'Baseline: a.md @ abc', 'Excluded: baseline row 1, candidate row 10', ...VERDICTS];
  assert.match(withResults(lines).join('\n'), /does not name candidate row 1/);
});
