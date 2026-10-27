import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkTestTiming, elapsedBounds } from '../verify/checks/test-timing.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-timing-'));
  fs.mkdirSync(path.join(root, 'tests'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, 'tests', name), text);
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try { checkTestTiming(createReport(), createRepository(root)); } finally { console.log = original; }
  return lines;
}

const asserted = (condition, callee = 'assert.ok') => `${callee}(${condition});`;

const OFFENDERS = {
  'direct clock minus start': asserted('Date.now() - started < 5000'),
  'performance clock': asserted('performance.now() - start <= 50, `took`'),
  'hrtime clock': asserted('process.hrtime.bigint() - begin < 1_000n'),
  'literal on the left': asserted('4000 > Date.now() - started'),
  'strict assert call': asserted('Date.now() - started < 4000, "slow"', 'assert'),
  'elapsed held in a variable': `const took = Date.now() - started;\n${asserted('took < 3000')}`
};

for (const [title, source] of Object.entries(OFFENDERS)) {
  test(`fails ${title}`, () => {
    assert.equal(elapsedBounds(source).length, 1, source);
  });
}

const PASSING = {
  'a ratio of two timed runs': asserted('two < one * 1.8, `one ${one}, two ${two}`'),
  'a bound that is another expression': asserted('Date.now() - started < stallMs / 4'),
  'a bound that is a name': asserted('Date.now() - started < LIMIT'),
  'a clock minus a literal, as a timestamp': asserted('record.updatedAt > Date.now() - 5000'),
  'a comparison with no assert': 'if (Date.now() - started < 5000) retry();',
  'an exempt message': asserted('Date.now() - started < 5000, `timing-ok: the hook has its own hard deadline`'),
  'a count compared to a literal': asserted('calls.length < 5000')
};

for (const [title, source] of Object.entries(PASSING)) {
  test(`passes ${title}`, () => {
    assert.deepEqual(elapsedBounds(source), [], source);
  });
}

test('the report prints one FAIL line per offending assert, naming the file, line and the timing-ok exemption', () => {
  const lines = run({
    'slow.test.mjs': `import x from 'x';\n${asserted('Date.now() - a < 100')}\n${asserted('Date.now() - b < 200')}\n`,
    'fine.test.mjs': `${asserted('a < b')}\n`
  });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /^\[FAIL\] test timing: tests\/slow\.test\.mjs:2 .*timing-ok:/);
  assert.match(lines[1], /^\[FAIL\] test timing: tests\/slow\.test\.mjs:3 /);
});

test('the report prints one PASS line when no test bounds an elapsed time', () => {
  assert.deepEqual(run({ 'fine.test.mjs': `${asserted('a < b')}\n` }), ['[PASS] test timing: 1 test files bound no raw elapsed time by a literal']);
});
