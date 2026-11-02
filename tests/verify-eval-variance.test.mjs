import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkEvalVariance, withoutVarianceGate } from '../verify/checks/eval-variance.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = { imports: { '#eval-stats': './lib/eval-stats.mjs', '#helper': { default: './lib/helper.mjs' } } };
const PAID_ENTRY = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";
const MESSAGE = 'NO-VARIANCE benchmarks/score.mjs: import a variance or noise gate from benchmarks/statistics.mjs or lib/eval-stats.mjs';

function repositoryWith(files, manifest = PACKAGE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-variance-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck(repository) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkEvalVariance(report, repository);
  return results[0];
}

test('a scorer without a variance import is flagged with the NO-VARIANCE message', () => {
  const repository = repositoryWith({ 'benchmarks/score.mjs': 'export const mean = (values) => values[0];\n' });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
  const result = runCheck(repository);
  assert.equal(result.ok, false);
  assert.equal(result.detail, MESSAGE);
});

test('a scorer is named score.mjs or ends with -score, -stats, -report, -readout, -metrics or -summary', () => {
  const source = 'export const mean = 1;\n';
  const repository = repositoryWith({
    'benchmarks/score.mjs': source,
    'benchmarks/a-score.mjs': source,
    'benchmarks/a-stats.mjs': source,
    'benchmarks/a-report.mjs': source,
    'benchmarks/a-readout.mjs': source,
    'benchmarks/a-metrics.mjs': source,
    'benchmarks/a-summary.mjs': source,
    'benchmarks/report.mjs': source,
    'benchmarks/scorer.mjs': source,
    'benchmarks/helper.mjs': source
  });
  assert.deepEqual(withoutVarianceGate(repository), [
    'benchmarks/a-metrics.mjs',
    'benchmarks/a-readout.mjs',
    'benchmarks/a-report.mjs',
    'benchmarks/a-score.mjs',
    'benchmarks/a-stats.mjs',
    'benchmarks/a-summary.mjs',
    'benchmarks/score.mjs'
  ]);
});

test('a paid entry point without a variance import is flagged', () => {
  const repository = repositoryWith({ 'benchmarks/drive.mjs': PAID_ENTRY, 'benchmarks/free.mjs': 'const options = process.argv.slice(2);\n' });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/drive.mjs']);
});

test('a direct import of benchmarks/statistics.mjs or lib/eval-stats.mjs passes', () => {
  const repository = repositoryWith({
    'benchmarks/statistics.mjs': 'export const mean = 1;\n',
    'benchmarks/score.mjs': "import { mean } from './statistics.mjs';\n",
    'benchmarks/deep/drive.mjs': `import { gate } from '../../lib/eval-stats.mjs';\n${PAID_ENTRY}`
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
  assert.equal(runCheck(repository).ok, true);
});

test('a multi-line import and a re-export reach the module', () => {
  const repository = repositoryWith({
    'benchmarks/a-score.mjs': "import {\n  mean,\n  gate\n} from './statistics.mjs';\n",
    'benchmarks/b-score.mjs': "export { gate } from './statistics.mjs';\n",
    'benchmarks/c-score.mjs': "import './statistics.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('a #alias import resolves through package.json imports', () => {
  const repository = repositoryWith({
    'benchmarks/score.mjs': "import { gate } from '#eval-stats';\n",
    'benchmarks/a-score.mjs': "import { helper } from '#helper';\n",
    'lib/helper.mjs': "import { gate } from './eval-stats.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('an unknown alias and a package import reach nothing', () => {
  const repository = repositoryWith({ 'benchmarks/score.mjs': "import { x } from '#unknown';\nimport fs from 'node:fs';\nimport pkg from 'pkg';\n" });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
});

test('the import is followed transitively through benchmarks and lib modules', () => {
  const repository = repositoryWith({
    'benchmarks/score.mjs': "import { a } from './one.mjs';\n",
    'benchmarks/one.mjs': "import { b } from '../lib/two.mjs';\n",
    'lib/two.mjs': "import { c } from '#helper';\n",
    'lib/helper.mjs': "import { gate } from '../benchmarks/statistics.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('an import cycle ends and a module outside benchmarks and lib is not followed', () => {
  const repository = repositoryWith({
    'benchmarks/score.mjs': "import './one.mjs';\n",
    'benchmarks/one.mjs': "import './score.mjs';\n",
    'benchmarks/a-score.mjs': "import '../verify/gate.mjs';\n",
    'verify/gate.mjs': "import '../benchmarks/statistics.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/a-score.mjs', 'benchmarks/score.mjs']);
});

test('an import that appears only in a comment does not count', () => {
  const repository = repositoryWith({ 'benchmarks/score.mjs': "// import { gate } from './statistics.mjs';\nexport const mean = 1;\n" });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
});

test('a dynamic import does not count', () => {
  const repository = repositoryWith({ 'benchmarks/score.mjs': "const stats = await import('./statistics.mjs');\n" });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
});

test('a fixture, result or run folder is not examined', () => {
  const repository = repositoryWith({
    'benchmarks/fixtures/app/score.mjs': 'export const mean = 1;\n',
    'benchmarks/results/a-score.mjs': 'export const mean = 1;\n',
    'benchmarks/runs/drive.mjs': PAID_ENTRY,
    'benchmarks/value/task/a-report.mjs': 'export const mean = 1;\n'
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('the claude wrapper that paid-benchmarks exempts is not examined', () => {
  const repository = repositoryWith({ 'benchmarks/confined-child.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n' });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('a repository without benchmarks or package.json passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-variance-'));
  assert.deepEqual(withoutVarianceGate(createRepository(root)), []);
  assert.equal(runCheck(createRepository(root)).ok, true);
});

test('every offender gets its own line in the failure detail', () => {
  const repository = repositoryWith({ 'benchmarks/a-score.mjs': 'export const mean = 1;\n', 'benchmarks/b-score.mjs': 'export const mean = 1;\n' });
  assert.equal(runCheck(repository).detail.split('\n').length, 2);
});

test('this repository passes', () => {
  assert.deepEqual(withoutVarianceGate(createRepository(ROOT)), []);
});
