import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkEvalPower, withoutPowerLine } from '../verify/checks/eval-power.mjs';
import { createRepository } from '../verify/repository.mjs';

const PACKAGE = { imports: { '#eval-stats': './lib/eval-stats.mjs', '#planner': { default: './lib/planner.mjs' } } };
const PAID_ENTRY = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";
const CALL = "console.log(powerLine({ tasks: 3 }));\n";
const MESSAGE = 'NO-POWER benchmarks/drive.mjs: print powerLine from lib/eval-stats.mjs in its --dry-run';

function repositoryWith(files, manifest = PACKAGE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-power-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const [name, source] of Object.entries({ 'lib/eval-stats.mjs': 'export function powerLine() {}\n', ...files })) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck(repository) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkEvalPower(report, repository);
  return results[0];
}

test('a paid entry point that never reaches powerLine is flagged with the NO-POWER message', () => {
  const repository = repositoryWith({ 'benchmarks/drive.mjs': PAID_ENTRY });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs']);
  const result = runCheck(repository);
  assert.equal(result.ok, false);
  assert.equal(result.detail, MESSAGE);
});

test('an entry point that only imports lib/eval-stats.mjs without calling powerLine is flagged', () => {
  const repository = repositoryWith({ 'benchmarks/drive.mjs': `import { meanCi } from '../lib/eval-stats.mjs';\n${PAID_ENTRY}` });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs']);
});

test('a script that is not a paid entry point is not examined', () => {
  const repository = repositoryWith({ 'benchmarks/score.mjs': 'const options = process.argv.slice(2);\n', 'benchmarks/lib.mjs': "const args = ['-p'];\n" });
  assert.deepEqual(withoutPowerLine(repository), []);
});

test('a direct powerLine call passes', () => {
  const repository = repositoryWith({ 'benchmarks/drive.mjs': `import { powerLine } from '../lib/eval-stats.mjs';\n${PAID_ENTRY}${CALL}` });
  assert.deepEqual(withoutPowerLine(repository), []);
  assert.equal(runCheck(repository).ok, true);
});

test('a powerLine call in an imported module passes, through a relative path or a #alias', () => {
  const repository = repositoryWith({
    'benchmarks/drive.mjs': `import { plan } from './plan.mjs';\n${PAID_ENTRY}`,
    'benchmarks/plan.mjs': `import { powerLine } from '../lib/eval-stats.mjs';\nexport const plan = () => ${CALL}`,
    'benchmarks/other.mjs': `import { plan } from '#planner';\n${PAID_ENTRY}`,
    'lib/planner.mjs': `import { powerLine } from '#eval-stats';\nexport const plan = () => ${CALL}`
  });
  assert.deepEqual(withoutPowerLine(repository), []);
});

test('an import cycle ends and a module outside benchmarks and lib is not followed', () => {
  const repository = repositoryWith({
    'benchmarks/drive.mjs': `import './one.mjs';\n${PAID_ENTRY}`,
    'benchmarks/one.mjs': "import './drive.mjs';\n",
    'benchmarks/other.mjs': `import '../verify/plan.mjs';\n${PAID_ENTRY}`,
    'verify/plan.mjs': CALL
  });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs', 'benchmarks/other.mjs']);
});

test('a powerLine call that appears only in a comment does not count', () => {
  const repository = repositoryWith({ 'benchmarks/drive.mjs': `// powerLine({ tasks: 3 })\n${PAID_ENTRY}` });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs']);
});

test('a fixture, result or run folder and the claude wrapper are not examined', () => {
  const repository = repositoryWith({
    'benchmarks/fixtures/app/drive.mjs': PAID_ENTRY,
    'benchmarks/results/drive.mjs': PAID_ENTRY,
    'benchmarks/runs/drive.mjs': PAID_ENTRY,
    'benchmarks/confined-child.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n'
  });
  assert.deepEqual(withoutPowerLine(repository), []);
});

test('a repository without benchmarks or package.json passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-power-'));
  assert.deepEqual(withoutPowerLine(createRepository(root)), []);
  assert.equal(runCheck(createRepository(root)).ok, true);
});

test('every offender gets its own line in the failure detail', () => {
  const repository = repositoryWith({ 'benchmarks/a.mjs': PAID_ENTRY, 'benchmarks/b.mjs': PAID_ENTRY });
  assert.equal(runCheck(repository).detail.split('\n').length, 2);
});
