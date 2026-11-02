import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MIN_GRADUATION_RUNS, graduationCandidates, graduationReport, runFreeSuites } from '../benchmarks/suites.mjs';
import { withoutVarianceGate } from '../verify/checks/eval-variance.mjs';
import { checkEvalSuites, manifestProblems, suiteFiles } from '../verify/checks/eval-suites.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SUITES_SCRIPT = path.join(ROOT, 'benchmarks', 'suites.mjs');
const SCORER = 'export const mean = 1;\n';
const PAID_ENTRY = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";
const PASSING = ['node', '-e', 'process.exit(0)'];

function suite(id, overrides = {}) {
  return { id, purpose: `purpose of ${id}`, class: 'capability', tier: 'paid', basis: 'why', entries: [], ...overrides };
}

function repositoryWith(files, manifest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-suites-'));
  const written = manifest === undefined ? files : { ...files, 'benchmarks/suites.json': JSON.stringify(manifest) };
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  for (const [name, source] of Object.entries(written)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck(repository) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkEvalSuites(report, repository);
  return results;
}

function withEnvironment(name, value, action) {
  const before = process.env[name];
  process.env[name] = value;
  try {
    return action();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

test('the committed manifest covers every scorer and paid entry point of this checkout', () => {
  const repository = createRepository(ROOT);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks', 'suites.json'), 'utf8'));
  assert.deepEqual(manifestProblems(repository, manifest), []);
});

test('the committed manifest tags every suite with a class and a tier, and only free regression suites run', () => {
  const { suites } = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks', 'suites.json'), 'utf8'));
  for (const entry of suites) {
    assert.ok(['capability', 'regression'].includes(entry.class), entry.id);
    assert.ok(['free', 'paid'].includes(entry.tier), entry.id);
    assert.equal(entry.run !== undefined, entry.tier === 'free' && entry.class === 'regression', entry.id);
  }
});

test('suiteFiles finds the files eval-variance holds to a variance gate', () => {
  const repository = repositoryWith({
    'benchmarks/score.mjs': SCORER,
    'benchmarks/a-score.mjs': SCORER,
    'benchmarks/a-stats.mjs': SCORER,
    'benchmarks/a-report.mjs': SCORER,
    'benchmarks/a-readout.mjs': SCORER,
    'benchmarks/a-metrics.mjs': SCORER,
    'benchmarks/sub/a-summary.mjs': SCORER,
    'benchmarks/paid.mjs': PAID_ENTRY,
    'benchmarks/confined-child.mjs': PAID_ENTRY,
    'benchmarks/report.mjs': SCORER,
    'benchmarks/helper.mjs': SCORER,
    'benchmarks/results/x-score.mjs': SCORER
  });
  assert.deepEqual(suiteFiles(repository), withoutVarianceGate(repository));
  assert.equal(suiteFiles(repository).length, 8);
});

test('a scorer or paid entry point outside the manifest is named', () => {
  const repository = repositoryWith({ 'benchmarks/a-score.mjs': SCORER, 'benchmarks/paid.mjs': PAID_ENTRY, 'benchmarks/known-score.mjs': SCORER }, {
    suites: [suite('known', { entries: ['benchmarks/known-score.mjs'] })]
  });
  const [result] = runCheck(repository);
  assert.equal(result.ok, false);
  assert.equal(result.detail, [
    'NO-SUITE benchmarks/a-score.mjs: scorer or paid entry point in no suite of benchmarks/suites.json',
    'NO-SUITE benchmarks/paid.mjs: scorer or paid entry point in no suite of benchmarks/suites.json'
  ].join('\n'));
});

test('a suite with no purpose, tier, class or basis is flagged', () => {
  const repository = repositoryWith({}, {
    suites: [
      suite('bare', { purpose: ' ', tier: undefined }),
      suite('classless', { class: 'other', basis: undefined })
    ]
  });
  const [result] = runCheck(repository);
  assert.equal(result.ok, false);
  assert.match(result.detail, /bare: no purpose/);
  assert.match(result.detail, /bare: tier must be one of free, paid/);
  assert.match(result.detail, /classless: class must be one of capability, regression/);
  assert.match(result.detail, /classless: no basis for its class/);
});

test('a missing entry, a doubly listed entry, a repeated id and a run on a paid suite are flagged', () => {
  const repository = repositoryWith({ 'benchmarks/a-score.mjs': SCORER }, {
    suites: [
      suite('one', { entries: ['benchmarks/a-score.mjs', 'benchmarks/gone-score.mjs'] }),
      suite('two', { entries: ['benchmarks/a-score.mjs'], run: PASSING }),
      suite('one')
    ]
  });
  const problems = manifestProblems(repository, JSON.parse(fs.readFileSync(repository.join('benchmarks/suites.json'), 'utf8')));
  assert.deepEqual([...problems].sort(), [
    'benchmarks/a-score.mjs: listed in both one and two',
    'one: entry benchmarks/gone-score.mjs does not exist',
    'one: id is used twice',
    'two: only a free regression suite carries run; paid suites stay manual'
  ]);
  assert.equal(problems.length, 4);
});

test('a free regression suite without a node command is flagged', () => {
  const repository = repositoryWith({}, { suites: [suite('free', { tier: 'free', class: 'regression' })] });
  const [result] = runCheck(repository);
  assert.equal(result.ok, false);
  assert.match(result.detail, /free: a free regression suite needs run/);
});

test('a missing manifest fails with the file named', () => {
  const [result] = runCheck(repositoryWith({}));
  assert.equal(result.ok, false);
  assert.match(result.detail, /benchmarks\/suites\.json is missing/);
});

test('a passing free regression suite passes the check and reports the slowest suite', () => {
  const repository = repositoryWith({}, { suites: [suite('green', { tier: 'free', class: 'regression', run: PASSING })] });
  const results = runCheck(repository);
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.match(results[1].detail, /^1 free regression suites passed with no model call, slowest \d+\.\d s$/);
});

test('a failing free regression suite fails the check with its output tail', () => {
  const failing = ['node', '-e', "console.log('grader broke'); process.exit(3)"];
  const repository = repositoryWith({}, {
    suites: [suite('green', { tier: 'free', class: 'regression', run: PASSING }), suite('red', { tier: 'free', class: 'regression', run: failing })]
  });
  const results = runCheck(repository);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[1].detail, 'FREE-SUITE red failed:\ngrader broke');
});

test('a free regression suite over the time cap fails as timed out', () => {
  const hanging = ['node', '-e', 'setTimeout(() => {}, 30000)'];
  const repository = repositoryWith({}, { suites: [suite('slow', { tier: 'free', class: 'regression', run: hanging })] });
  const results = withEnvironment('EXO_SUITE_TIMEOUT_MS', '300', () => runCheck(repository));
  assert.equal(results[1].ok, false);
  assert.match(results[1].detail, /^FREE-SUITE slow timed out:/);
});

test('runFreeSuites keeps the order of the suites it was given', async () => {
  const slow = suite('slow', { run: ['node', '-e', 'setTimeout(() => {}, 200)'] });
  const quick = suite('quick', { run: PASSING });
  const results = await runFreeSuites(ROOT, [slow, quick], { concurrency: 2, timeoutMs: 10000 });
  assert.deepEqual(results.map((result) => [result.id, result.ok]), [['slow', true], ['quick', true]]);
});

test('graduationCandidates lists a case that passed every run from the minimum count on', () => {
  const records = [
    ...Array.from({ length: 5 }, () => ({ case: 'steady', pass: true })),
    ...Array.from({ length: 5 }, (_, index) => ({ case: 'flaky', pass: index > 0 })),
    ...Array.from({ length: 4 }, () => ({ case: 'young', pass: true }))
  ];
  assert.deepEqual(graduationCandidates(records, { minRuns: 5 }), [{ case: 'steady', runs: 5 }]);
  assert.deepEqual(graduationCandidates(records, { minRuns: 4 }), [{ case: 'steady', runs: 5 }, { case: 'young', runs: 4 }]);
  assert.deepEqual(graduationCandidates(records), []);
  assert.equal(MIN_GRADUATION_RUNS, 20);
});

test('a record whose pass is not true counts against the case', () => {
  const records = Array.from({ length: 6 }, (_, index) => ({ case: 'odd', pass: index === 0 ? 'yes' : true }));
  assert.deepEqual(graduationCandidates(records, { minRuns: 5 }), []);
});

function recordedRepository(klass) {
  const rows = Array.from({ length: 6 }, (_, index) => ({ case: index % 2 === 0 ? 'even' : 'odd', pass: true, arm: 'x' }));
  rows.push({ case: 'odd', pass: false });
  const repository = repositoryWith({ 'benchmarks/results/runs.jsonl': `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` }, {
    suites: [suite('recorded', { class: klass, recorded: { file: 'benchmarks/results/runs.jsonl', caseKey: 'case', passKey: 'pass' } }), suite('unrecorded')]
  });
  return { root: repository.join('.'), manifest: JSON.parse(fs.readFileSync(repository.join('benchmarks/suites.json'), 'utf8')) };
}

test('graduationReport proposes a capability case and only measures a regression suite', () => {
  const capability = recordedRepository('capability');
  assert.deepEqual(graduationReport(capability.root, capability.manifest, { minRuns: 3 }).map((entry) => entry.graduate), [[{ case: 'even', runs: 3 }]]);
  const regression = recordedRepository('regression');
  const [entry] = graduationReport(regression.root, regression.manifest, { minRuns: 3 });
  assert.deepEqual(entry.graduate, []);
  assert.deepEqual(entry.saturated, [{ case: 'even', runs: 3 }]);
  assert.equal(entry.cases, 2);
});

test('suites.mjs --graduate prints the candidates and --list prints the suites', () => {
  const { root } = recordedRepository('capability');
  const graduate = spawnSync(process.execPath, [SUITES_SCRIPT, '--graduate', '--min-runs', '3', '--root', root], { encoding: 'utf8' });
  assert.equal(graduate.status, 0, graduate.stderr);
  assert.equal(graduate.stdout.trim(), 'recorded: capability; graduate to regression: even (3 runs)');
  const list = spawnSync(process.execPath, [SUITES_SCRIPT, '--list', '--root', root], { encoding: 'utf8' });
  assert.deepEqual(list.stdout.trim().split('\n').map((line) => line.split('\t').slice(0, 3)), [['recorded', 'capability', 'paid'], ['unrecorded', 'capability', 'paid']]);
});

test('suites.mjs exits 2 for a missing action, a bad count and a missing manifest', () => {
  const run = (...args) => spawnSync(process.execPath, [SUITES_SCRIPT, ...args], { encoding: 'utf8' });
  assert.equal(run().status, 2);
  assert.equal(run('--graduate', '--min-runs', '0').status, 2);
  assert.equal(run('--list', '--root', os.tmpdir()).status, 2);
  assert.match(run('--help').stdout, /^usage: suites\.mjs/);
});

test('suites.mjs --run exits 1 when a free regression suite fails', () => {
  const failing = ['node', '-e', 'process.exit(1)'];
  const repository = repositoryWith({}, { suites: [suite('red', { tier: 'free', class: 'regression', run: failing })] });
  const run = spawnSync(process.execPath, [SUITES_SCRIPT, '--run', '--root', repository.join('.')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^FAIL red /);
});

test('the graduation run minimum comes from defaults.eval', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-defaults-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { eval: { graduationRuns: 7 } } }));
  const script = "import('./benchmarks/suites.mjs').then((m) => console.log(m.MIN_GRADUATION_RUNS))";
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.join(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(Number(run.stdout), 7);
});
