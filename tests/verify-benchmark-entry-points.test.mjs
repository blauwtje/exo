import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBenchmarkEntryPoints, unguardedPaidBenchmarks, withoutPowerLine, withoutVarianceGate } from '../verify/checks/benchmark-entry-points.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT_Paid = fileURLToPath(new URL('..', import.meta.url));

function repositoryWith_Paid(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paid-benchmarks-'));
  fs.mkdirSync(path.join(root, 'benchmarks'));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, 'benchmarks', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck_Paid(repository, exemptions) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkBenchmarkEntryPoints(report, repository, exemptions);
  return results;
}

const PAID_ENTRY_Paid = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";

test('a paid entry point with neither guard is flagged', () => {
  const repository = repositoryWith_Paid({ 'bare.mjs': PAID_ENTRY_Paid });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/bare.mjs']);
  const [result] = runCheck_Paid(repository);
  assert.equal(result.ok, false);
  assert.match(result.detail, /benchmarks\/bare\.mjs/);
});

const DRY_RUN_FLAG_Paid = "if (options.includes('--dry-run')) process.exit(0);\n";

test('a paid entry point with both guards passes', () => {
  const repository = repositoryWith_Paid({ 'both.mjs': `${PAID_ENTRY_Paid}${DRY_RUN_FLAG_Paid}const mode = 'quick';\n` });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
  assert.equal(runCheck_Paid(repository)[0].ok, true);
});

test('a paid entry point with only --dry-run or only a quick tier is flagged', () => {
  const repository = repositoryWith_Paid({
    'dry-only.mjs': `${PAID_ENTRY_Paid}${DRY_RUN_FLAG_Paid}`,
    'quick-only.mjs': `${PAID_ENTRY_Paid}const mode = 'quick';\n`
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/dry-only.mjs', 'benchmarks/quick-only.mjs']);
});

test('a guard that appears only in a comment does not count', () => {
  const repository = repositoryWith_Paid({
    'line.mjs': `${PAID_ENTRY_Paid}// --dry-run and a quick tier are planned\n`,
    'block.mjs': `${PAID_ENTRY_Paid}/* const mode = 'quick'; options.includes('--dry-run') */\n`
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/block.mjs', 'benchmarks/line.mjs']);
});

const WITH_DRY_RUN_Paid = `${PAID_ENTRY_Paid}${DRY_RUN_FLAG_Paid}`;

test('a quick default is a quick value assigned, defaulted or falling through a ternary', () => {
  const repository = repositoryWith_Paid({
    'nullish.mjs': `${WITH_DRY_RUN_Paid}const tier = flags.tier ?? 'quick';\n`,
    'assigned.mjs': `${WITH_DRY_RUN_Paid}const mode = 'quick';\n`,
    'ternary.mjs': `${WITH_DRY_RUN_Paid}const mode = flags.full ? 'full' : 'quick';\n`,
    'tiers.mjs': `${WITH_DRY_RUN_Paid}const tier = flags.full ? TIERS.full : TIERS.quick;\n`,
    'fallback.mjs': `${WITH_DRY_RUN_Paid}const label = flags.writeBaseline ? 'baseline' : 'quick';\n`,
    'negated.mjs': `${WITH_DRY_RUN_Paid}const options = { quick: !flags.has('--full') };\n`,
    'constant.mjs': `${WITH_DRY_RUN_Paid}const runs = Number(flags.runs ?? QUICK_RUNS);\n`,
    'reader.mjs': `${WITH_DRY_RUN_Paid}const runs = whole('runs', QUICK_RUNS, 1);\n`
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
});

test('the word quick without a default value is not a quick default tier', () => {
  const repository = repositoryWith_Paid({
    'usage.mjs': `${WITH_DRY_RUN_Paid}const USAGE = 'quick runs are cheap';\n`,
    'compared.mjs': `${WITH_DRY_RUN_Paid}if (flags.tier === 'quick') run();\n`,
    'file.mjs': `${WITH_DRY_RUN_Paid}const QUICK_FILE = 'routing-quick.json';\n`,
    'full-default.mjs': `${WITH_DRY_RUN_Paid}const mode = flags.mode ?? 'full';\n`
  });
  assert.deepEqual(
    unguardedPaidBenchmarks(repository),
    ['benchmarks/compared.mjs', 'benchmarks/file.mjs', 'benchmarks/full-default.mjs', 'benchmarks/usage.mjs']
  );
});

test('a paid helper without an argv entry point and a free script are not examined', () => {
  const repository = repositoryWith_Paid({
    'helper.mjs': "export const ARGS = ['-p', prompt];\n",
    'free.mjs': 'const options = process.argv.slice(2);\n'
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
});

test('an API caller is paid', () => {
  const repository = repositoryWith_Paid({ 'api.mjs': "fetch('https://api.anthropic.com/v1/messages');\nprocess.argv;\n" });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/api.mjs']);
});

test('a paid entry point in a subdirectory is flagged', () => {
  const repository = repositoryWith_Paid({ 'deep/nested/drive.mjs': PAID_ENTRY_Paid });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/deep/nested/drive.mjs']);
});

test('a fixture, result or run folder is not examined', () => {
  const repository = repositoryWith_Paid({
    'fixtures/app/bare.mjs': PAID_ENTRY_Paid,
    'results/bare.mjs': PAID_ENTRY_Paid,
    'runs/bare.mjs': PAID_ENTRY_Paid,
    'value/task/bare.mjs': PAID_ENTRY_Paid
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
});

test('a confined claude launch or a sweep runClaude call is paid', () => {
  const repository = repositoryWith_Paid({
    'confined.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n',
    'sub/forked.mjs': "import { runClaude } from '../sweep.mjs';\nawait runClaude(cell);\nprocess.argv;\n"
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/confined.mjs', 'benchmarks/sub/forked.mjs']);
});

test('a --confirm guard alone is not a quick tier', () => {
  const repository = repositoryWith_Paid({ 'confirm.mjs': `${PAID_ENTRY_Paid}if (!options.includes('--confirm')) process.exit(2);\n` });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/confirm.mjs']);
});

const GUARDED_Paid = "const options = process.argv.slice(2);\nconst dry = options.includes('--dry-run');\nconst mode = 'quick';\n";

test('a helper exempted with a caller that has --dry-run and a quick tier passes and prints its reason', () => {
  const repository = repositoryWith_Paid({ 'helper.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n', 'caller.mjs': GUARDED_Paid });
  const exemptions = { 'benchmarks/helper.mjs': { callers: ['benchmarks/caller.mjs'], reason: 'started only by caller.mjs' } };
  assert.deepEqual(unguardedPaidBenchmarks(repository, exemptions), []);
  const [result] = runCheck_Paid(repository, exemptions);
  assert.equal(result.ok, true);
  assert.match(result.detail, /benchmarks\/helper\.mjs: started only by caller\.mjs/);
});

test('an exemption whose caller lacks --dry-run or a quick tier does not exempt', () => {
  const repository = repositoryWith_Paid({
    'helper.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n',
    'caller.mjs': "const options = process.argv.slice(2);\nconst dry = options.includes('--dry-run');\n"
  });
  const exemptions = { 'benchmarks/helper.mjs': { callers: ['benchmarks/caller.mjs'], reason: 'started only by caller.mjs' } };
  assert.deepEqual(unguardedPaidBenchmarks(repository, exemptions), ['benchmarks/helper.mjs']);
});

test('a repository without benchmarks passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paid-benchmarks-'));
  assert.deepEqual(unguardedPaidBenchmarks(createRepository(root)), []);
});

test('this repository passes', () => {
  assert.deepEqual(unguardedPaidBenchmarks(createRepository(ROOT_Paid)), []);
});

const ROOT_Variance = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_Variance = { imports: { '#eval-stats': './lib/eval-stats.mjs', '#helper': { default: './lib/helper.mjs' } } };
const PAID_ENTRY_Variance = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";
const MESSAGE_Variance = 'NO-VARIANCE benchmarks/score.mjs: import a variance or noise gate from benchmarks/statistics.mjs or lib/eval-stats.mjs';

function repositoryWith_Variance(files, manifest = PACKAGE_Variance) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-variance-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck_Variance(repository) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkBenchmarkEntryPoints(report, repository);
  return results.find((entry) => entry.name === 'eval variance');
}

test('a scorer without a variance import is flagged with the NO-VARIANCE message', () => {
  const repository = repositoryWith_Variance({ 'benchmarks/score.mjs': 'export const mean = (values) => values[0];\n' });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
  const result = runCheck_Variance(repository);
  assert.equal(result.ok, false);
  assert.equal(result.detail, MESSAGE_Variance);
});

test('a scorer is named score.mjs or ends with -score, -stats, -report, -readout, -metrics or -summary', () => {
  const source = 'export const mean = 1;\n';
  const repository = repositoryWith_Variance({
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
  const repository = repositoryWith_Variance({ 'benchmarks/drive.mjs': PAID_ENTRY_Variance, 'benchmarks/free.mjs': 'const options = process.argv.slice(2);\n' });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/drive.mjs']);
});

test('a direct import of benchmarks/statistics.mjs or lib/eval-stats.mjs passes', () => {
  const repository = repositoryWith_Variance({
    'benchmarks/statistics.mjs': 'export const mean = 1;\n',
    'benchmarks/score.mjs': "import { mean } from './statistics.mjs';\n",
    'benchmarks/deep/drive.mjs': `import { gate } from '../../lib/eval-stats.mjs';\n${PAID_ENTRY_Variance}`
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
  assert.equal(runCheck_Variance(repository).ok, true);
});

test('a multi-line import and a re-export reach the module', () => {
  const repository = repositoryWith_Variance({
    'benchmarks/a-score.mjs': "import {\n  mean,\n  gate\n} from './statistics.mjs';\n",
    'benchmarks/b-score.mjs': "export { gate } from './statistics.mjs';\n",
    'benchmarks/c-score.mjs': "import './statistics.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('a #alias import resolves through package.json imports', () => {
  const repository = repositoryWith_Variance({
    'benchmarks/score.mjs': "import { gate } from '#eval-stats';\n",
    'benchmarks/a-score.mjs': "import { helper } from '#helper';\n",
    'lib/helper.mjs': "import { gate } from './eval-stats.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('an unknown alias and a package import reach nothing', () => {
  const repository = repositoryWith_Variance({ 'benchmarks/score.mjs': "import { x } from '#unknown';\nimport fs from 'node:fs';\nimport pkg from 'pkg';\n" });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
});

test('the import is followed transitively through benchmarks and lib modules', () => {
  const repository = repositoryWith_Variance({
    'benchmarks/score.mjs': "import { a } from './one.mjs';\n",
    'benchmarks/one.mjs': "import { b } from '../lib/two.mjs';\n",
    'lib/two.mjs': "import { c } from '#helper';\n",
    'lib/helper.mjs': "import { gate } from '../benchmarks/statistics.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('an import cycle ends and a module outside benchmarks and lib is not followed', () => {
  const repository = repositoryWith_Variance({
    'benchmarks/score.mjs': "import './one.mjs';\n",
    'benchmarks/one.mjs': "import './score.mjs';\n",
    'benchmarks/a-score.mjs': "import '../verify/gate.mjs';\n",
    'verify/gate.mjs': "import '../benchmarks/statistics.mjs';\n"
  });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/a-score.mjs', 'benchmarks/score.mjs']);
});

test('an import that appears only in a comment does not count', () => {
  const repository = repositoryWith_Variance({ 'benchmarks/score.mjs': "// import { gate } from './statistics.mjs';\nexport const mean = 1;\n" });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
});

test('a dynamic import does not count', () => {
  const repository = repositoryWith_Variance({ 'benchmarks/score.mjs': "const stats = await import('./statistics.mjs');\n" });
  assert.deepEqual(withoutVarianceGate(repository), ['benchmarks/score.mjs']);
});

test('a fixture, result or run folder is not examined', () => {
  const repository = repositoryWith_Variance({
    'benchmarks/fixtures/app/score.mjs': 'export const mean = 1;\n',
    'benchmarks/results/a-score.mjs': 'export const mean = 1;\n',
    'benchmarks/runs/drive.mjs': PAID_ENTRY_Variance,
    'benchmarks/value/task/a-report.mjs': 'export const mean = 1;\n'
  });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('the claude wrapper that paid-benchmarks exempts is not examined', () => {
  const repository = repositoryWith_Variance({ 'benchmarks/confined-child.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n' });
  assert.deepEqual(withoutVarianceGate(repository), []);
});

test('a repository without benchmarks or package.json passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-variance-'));
  assert.deepEqual(withoutVarianceGate(createRepository(root)), []);
  assert.equal(runCheck_Variance(createRepository(root)).ok, true);
});

test('every offender gets its own line in the failure detail', () => {
  const repository = repositoryWith_Variance({ 'benchmarks/a-score.mjs': 'export const mean = 1;\n', 'benchmarks/b-score.mjs': 'export const mean = 1;\n' });
  assert.equal(runCheck_Variance(repository).detail.split('\n').length, 2);
});

test('this repository passes', () => {
  assert.deepEqual(withoutVarianceGate(createRepository(ROOT_Variance)), []);
});

const PACKAGE_Power = { imports: { '#eval-stats': './lib/eval-stats.mjs', '#planner': { default: './lib/planner.mjs' } } };
const PAID_ENTRY_Power = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";
const CALL_Power = "console.log(powerLine({ tasks: 3 }));\n";
const MESSAGE_Power = 'NO-POWER benchmarks/drive.mjs: print powerLine from lib/eval-stats.mjs in its --dry-run';

function repositoryWith_Power(files, manifest = PACKAGE_Power) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-power-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const [name, source] of Object.entries({ 'lib/eval-stats.mjs': 'export function powerLine() {}\n', ...files })) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck_Power(repository) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkBenchmarkEntryPoints(report, repository);
  return results.find((entry) => entry.name === 'eval power');
}

test('a paid entry point that never reaches powerLine is flagged with the NO-POWER message', () => {
  const repository = repositoryWith_Power({ 'benchmarks/drive.mjs': PAID_ENTRY_Power });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs']);
  const result = runCheck_Power(repository);
  assert.equal(result.ok, false);
  assert.equal(result.detail, MESSAGE_Power);
});

test('an entry point that only imports lib/eval-stats.mjs without calling powerLine is flagged', () => {
  const repository = repositoryWith_Power({ 'benchmarks/drive.mjs': `import { meanCi } from '../lib/eval-stats.mjs';\n${PAID_ENTRY_Power}` });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs']);
});

test('a script that is not a paid entry point is not examined', () => {
  const repository = repositoryWith_Power({ 'benchmarks/score.mjs': 'const options = process.argv.slice(2);\n', 'benchmarks/lib.mjs': "const args = ['-p'];\n" });
  assert.deepEqual(withoutPowerLine(repository), []);
});

test('a direct powerLine call passes', () => {
  const repository = repositoryWith_Power({ 'benchmarks/drive.mjs': `import { powerLine } from '../lib/eval-stats.mjs';\n${PAID_ENTRY_Power}${CALL_Power}` });
  assert.deepEqual(withoutPowerLine(repository), []);
  assert.equal(runCheck_Power(repository).ok, true);
});

test('a powerLine call in an imported module passes, through a relative path or a #alias', () => {
  const repository = repositoryWith_Power({
    'benchmarks/drive.mjs': `import { plan } from './plan.mjs';\n${PAID_ENTRY_Power}`,
    'benchmarks/plan.mjs': `import { powerLine } from '../lib/eval-stats.mjs';\nexport const plan = () => ${CALL_Power}`,
    'benchmarks/other.mjs': `import { plan } from '#planner';\n${PAID_ENTRY_Power}`,
    'lib/planner.mjs': `import { powerLine } from '#eval-stats';\nexport const plan = () => ${CALL_Power}`
  });
  assert.deepEqual(withoutPowerLine(repository), []);
});

test('an import cycle ends and a module outside benchmarks and lib is not followed', () => {
  const repository = repositoryWith_Power({
    'benchmarks/drive.mjs': `import './one.mjs';\n${PAID_ENTRY_Power}`,
    'benchmarks/one.mjs': "import './drive.mjs';\n",
    'benchmarks/other.mjs': `import '../verify/plan.mjs';\n${PAID_ENTRY_Power}`,
    'verify/plan.mjs': CALL_Power
  });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs', 'benchmarks/other.mjs']);
});

test('a powerLine call that appears only in a comment does not count', () => {
  const repository = repositoryWith_Power({ 'benchmarks/drive.mjs': `// powerLine({ tasks: 3 })\n${PAID_ENTRY_Power}` });
  assert.deepEqual(withoutPowerLine(repository), ['benchmarks/drive.mjs']);
});

test('a fixture, result or run folder and the claude wrapper are not examined', () => {
  const repository = repositoryWith_Power({
    'benchmarks/fixtures/app/drive.mjs': PAID_ENTRY_Power,
    'benchmarks/results/drive.mjs': PAID_ENTRY_Power,
    'benchmarks/runs/drive.mjs': PAID_ENTRY_Power,
    'benchmarks/confined-child.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n'
  });
  assert.deepEqual(withoutPowerLine(repository), []);
});

test('a repository without benchmarks or package.json passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-power-'));
  assert.deepEqual(withoutPowerLine(createRepository(root)), []);
  assert.equal(runCheck_Power(createRepository(root)).ok, true);
});

test('every offender gets its own line in the failure detail', () => {
  const repository = repositoryWith_Power({ 'benchmarks/a.mjs': PAID_ENTRY_Power, 'benchmarks/b.mjs': PAID_ENTRY_Power });
  assert.equal(runCheck_Power(repository).detail.split('\n').length, 2);
});
