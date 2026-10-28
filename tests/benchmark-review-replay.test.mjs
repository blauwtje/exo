import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { changedRanges, gradeRepair, isClean, loadFixtures, loadPlants, main, parseFindings, renderTable, replayAll, saveBaseline, summarize, withBaseline, writeReport } from '../benchmarks/review-replay.mjs';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const TASK = SAFE_TASKS[0];
const PLANTS = [{ path: 'uploads.js', range: '4-6', class: 'defect' }];
const REVIEW_FINDINGS = [
  'FINDINGS',
  '',
  'uploads.js:4-6; defect; unchecked join; joins the raw filename; fix',
  '  Probe: node --check uploads.js',
  '  Class: unchecked path join',
  '  Sweep: true',
  'uploads.js:1-1; defect; stray; nothing wrong here; fix',
  'uploads.js:2-2; note; naming; rename; report',
  'Count: defect 2, concern 0, question 0, note 1',
  ''
].join('\n');

function commitAll(repository) {
  const identity = ['-c', 'user.name=fixer', '-c', 'user.email=fixer@example.com', '-c', 'commit.gpgsign=false'];
  spawnSync('git', ['-C', repository, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repository, ...identity, 'commit', '-q', '-m', 'fix(safe): repair'], { encoding: 'utf8' });
}

function scriptedModel(calls, { costUsd, onCall, commits = false } = {}) {
  const own = [];
  return async (prompt, repository) => {
    calls.push(prompt);
    own.push(prompt);
    await onCall?.();
    const findings = path.join(repository, '.exo', 'review-branch.md');
    fs.mkdirSync(path.dirname(findings), { recursive: true });
    const reviews = own.filter((call) => call.includes('exo:review-branch')).length;
    if (prompt.includes('exo:fix-review')) {
      const file = path.join(repository, 'uploads.js');
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines[4] = `${lines[4]} `;
      fs.writeFileSync(file, lines.join('\n'));
      if (commits) commitAll(repository);
      return costUsd;
    }
    fs.writeFileSync(findings, reviews === 1 ? REVIEW_FINDINGS : 'CLEAN\n\nCount: defect 0, concern 0, question 0, note 0\n');
    return costUsd;
  };
}

test('parseFindings reads both finding layouts and the fix mark', () => {
  const found = parseFindings(`${REVIEW_FINDINGS}auth.js:9-11 defect: verifyToken skips the signature. fix\n`);
  assert.deepEqual(found.map((finding) => [finding.path, finding.start, finding.end, finding.weight, finding.fix]), [
    ['uploads.js', 4, 6, 'defect', true],
    ['uploads.js', 1, 1, 'defect', true],
    ['uploads.js', 2, 2, 'note', false],
    ['auth.js', 9, 11, 'defect', true]
  ]);
});

test('isClean needs no fix and no concern line, and no BLOCKED verdict', () => {
  assert.equal(isClean('CLEAN\n'), true);
  assert.equal(isClean(REVIEW_FINDINGS), false);
  assert.equal(isClean('a.js:1-2; concern; rule; evidence; report\n'), false);
  assert.equal(isClean('BLOCKED\n'), false);
});

test('changedRanges reads the old side of each hunk per file', () => {
  const diff = '--- a/uploads.js\n+++ b/uploads.js\n@@ -5 +5 @@\n-x\n+y\n@@ -9,3 +9,0 @@\n-a\n-b\n-c\n@@ -12,0 +13,2 @@\n+p\n+q\n';
  assert.deepEqual(changedRanges(diff), [
    { path: 'uploads.js', start: 5, end: 5 },
    { path: 'uploads.js', start: 9, end: 11 },
    { path: 'uploads.js', start: 12, end: 12 }
  ]);
});

test('gradeRepair counts planted ranges the diff touched and fix lines outside every plant', () => {
  const diff = '--- a/uploads.js\n+++ b/uploads.js\n@@ -5 +5 @@\n-x\n+y\n';
  assert.deepEqual(gradeRepair(PLANTS, REVIEW_FINDINGS, diff), { planted: 1, fixed: 1, falseFix: 1 });
  assert.deepEqual(gradeRepair(PLANTS, REVIEW_FINDINGS, ''), { planted: 1, fixed: 0, falseFix: 1 });
});

test('loadPlants falls back to the known defect range of a safe task', () => {
  assert.deepEqual(loadPlants(TASK, path.join(ROOT, 'benchmarks', 'safe')), PLANTS);
});

const OPTIONS = { tasks: [TASK], pluginDir: ROOT, rounds: 3, repeat: 2, safeRoot: path.join(ROOT, 'benchmarks', 'safe') };

test('a replay with a stubbed model reaches CLEAN in two rounds and grades the first repair', async () => {
  const calls = [];
  const [cell] = await replayAll(OPTIONS, () => scriptedModel(calls));
  assert.equal(cell.runs, 2);
  assert.equal(cell.failures, 0);
  assert.equal(cell.neverClean, 0);
  assert.equal(cell.roundsToClean.mean, 2);
  assert.equal(cell.fixedAfterOneRepair.mean, 1);
  assert.equal(cell.falseFixLines.mean, 0);
  assert.equal(calls.filter((call) => call.includes('exo:fix-review')).length, 2);
  assert.match(calls[0], /DISPATCH Branch: .*scope=branch main\.\.HEAD/);
});

test('a repair the fixer commits itself still grades as fixed', async () => {
  const [cell] = await replayAll({ ...OPTIONS, repeat: 1 }, () => scriptedModel([], { commits: true }));
  assert.equal(cell.fixedAfterOneRepair.mean, 1);
});

test('the fixer reads the merged branch review, where demotions land, not the raw review', async () => {
  const calls = [];
  await replayAll({ ...OPTIONS, repeat: 1 }, () => scriptedModel(calls));
  const [fixCall] = calls.filter((call) => call.includes('exo:fix-review'));
  assert.match(fixCall, /findings path \S*[\\/]\.exo[\\/]branch-review\.md\./);
});

function keptRuns(keepDir) {
  return fs.readdirSync(keepDir).map((name) => path.join(keepDir, name));
}

test('a replay round merges the review into the ledger and keeps the run record', async () => {
  const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-kept-'));
  try {
    const [cell] = await replayAll({ ...OPTIONS, repeat: 1, keepDir }, () => scriptedModel([]));
    assert.equal(cell.roundsToClean.mean, 2);
    const [run] = keptRuns(keepDir);
    const rows = fs.readFileSync(path.join(run, 'review-ledger.jsonl'), 'utf8').trim().split('\n').map((row) => JSON.parse(row));
    assert.deepEqual([...new Set(rows.map((row) => row.round))], [1, 2]);
    assert.match(fs.readFileSync(path.join(run, 'review-input.md'), 'utf8'), /## Ledger/);
    assert.match(fs.readFileSync(path.join(run, 'rounds', 'review-1.md'), 'utf8'), /unchecked join/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8')).roundsToClean, 2);
  } finally {
    fs.rmSync(keepDir, { recursive: true, force: true });
  }
});

test('the kept run record dir is named by task and repeat index and run.json names the task', async () => {
  const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-kept-'));
  try {
    await replayAll({ ...OPTIONS, repeat: 2, jobs: 1, keepDir }, () => scriptedModel([]));
    assert.deepEqual(fs.readdirSync(keepDir).sort(), [`${TASK.id}-r0`, `${TASK.id}-r1`]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(keepDir, `${TASK.id}-r1`, 'run.json'), 'utf8')).task, TASK.id);
  } finally {
    fs.rmSync(keepDir, { recursive: true, force: true });
  }
});

test('a finding that recurs after its repair stops the run as never clean and records why', async () => {
  const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-kept-'));
  try {
    const stubbed = scriptedModel([]);
    const repeating = async (prompt, repository) => {
      const cost = await stubbed(prompt, repository);
      if (prompt.includes('exo:review-branch')) fs.writeFileSync(path.join(repository, '.exo', 'review-branch.md'), REVIEW_FINDINGS);
      return cost;
    };
    const [cell] = await replayAll({ ...OPTIONS, repeat: 1, keepDir }, () => repeating);
    assert.equal(cell.neverClean, 1);
    const [run] = keptRuns(keepDir);
    assert.match(JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8')).stopReason, /^recurring unchecked join uploads\.js$/);
  } finally {
    fs.rmSync(keepDir, { recursive: true, force: true });
  }
});

test('summarize reports the spread across repeated runs and the runs that never reach CLEAN', () => {
  const graded = (fixed, roundsToClean) => ({ failure: null, roundsToClean, costUsd: 0, grade: { planted: 2, fixed, falseFix: 0 } });
  const cell = summarize(TASK, [graded(2, 1), graded(0, null), graded(1, 3)]);
  assert.equal(cell.fixedAfterOneRepair.mean, 0.5);
  assert.ok(cell.fixedAfterOneRepair.sd > 0);
  assert.equal(cell.neverClean, 1);
  assert.equal(cell.roundsToClean.n, 2);
});

test('jobs run fixture-repeat runs concurrently', async () => {
  let active = 0;
  let peak = 0;
  const onCall = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
  };
  const [cell] = await replayAll({ ...OPTIONS, repeat: 4, jobs: 4 }, () => scriptedModel([], { onCall }));
  assert.equal(cell.runs, 4);
  assert.ok(peak > 1, `peak ${peak}`);
  peak = 0;
  await replayAll({ ...OPTIONS, repeat: 2, jobs: 1 }, () => scriptedModel([], { onCall }));
  assert.equal(peak, 1);
});

test('the budget starts no new run once the summed session cost passes it', async () => {
  const [cell] = await replayAll({ ...OPTIONS, repeat: 3, jobs: 1, budgetUsd: 5 }, () => scriptedModel([], { costUsd: 2 }));
  assert.equal(cell.runs, 1);
  assert.equal(cell.skipped, 2);
  assert.equal(cell.costUsd, 6);
});

test('renderTable writes a header, a divider and one row per cell', () => {
  const run = { failure: null, roundsToClean: 2, costUsd: 1.5, grade: { planted: 1, fixed: 1, falseFix: 1 } };
  const lines = renderTable([{ ...summarize(TASK, [run]), skipped: 0 }]).trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^\| task \| runs \| skipped /);
  assert.equal(lines[2], `| ${TASK.id} | 1 | 0 | 0 | 1.00 | 1.00 | 2.00 | 0 | 1.50 | - |`);
});

test('log: each kept run.json records durationMs', async () => {
  const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-kept-'));
  try {
    await replayAll({ ...OPTIONS, repeat: 1, keepDir }, () => scriptedModel([]));
    const [run] = keptRuns(keepDir);
    const { durationMs } = JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8'));
    assert.ok(Number.isInteger(durationMs) && durationMs >= 0, `durationMs ${durationMs}`);
  } finally {
    fs.rmSync(keepDir, { recursive: true, force: true });
  }
});

test('the log beside the report holds mode, summed cost, duration and the cells', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-log-'));
  try {
    const cells = await replayAll({ ...OPTIONS, repeat: 2, jobs: 1 }, () => scriptedModel([], { costUsd: 0.5 }));
    const out = path.join(dir, 'nested', 'report.md');
    writeReport({ out, keepDir: `${out}.runs`, mode: 'quick', cells, durationMs: 1234 });
    const log = JSON.parse(fs.readFileSync(`${out}.json`, 'utf8'));
    assert.deepEqual(log, JSON.parse(JSON.stringify({ mode: 'quick', cost_usd: 3, durationMs: 1234, cells })));
    assert.match(fs.readFileSync(out, 'utf8'), /^\| task \|/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadFixtures strips the .seed suffix from the planted source and reads its plants', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-load-'));
  try {
    fs.mkdirSync(path.join(root, 'dead-code', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dead-code', 'src', 'a.js.seed'), 'one\ntwo\n');
    fs.writeFileSync(path.join(root, 'dead-code', 'plants.json'), JSON.stringify([{ path: 'src/a.js', range: '1-2', class: 'dead code' }]));
    const [fixture] = loadFixtures(root);
    assert.deepEqual([fixture.id, fixture.file, fixture.plants.length], ['dead-code', path.join('src', 'a.js'), 1]);
    fs.writeFileSync(path.join(root, 'dead-code', 'b.js.seed'), 'x\n');
    assert.throws(() => loadFixtures(root), /exactly one \.seed source/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const CLASS_FIXTURES = ['copied-block', 'dead-code', 'duplicate-truth-source', 'narrating-comment', 'swallowed-failure', 'untested-branch'];

test('benchmarks/review-replay holds one fixture per repeat class with 2-3 plants, plus a two-round fixture', () => {
  const fixtures = loadFixtures();
  assert.deepEqual(fixtures.map((fixture) => fixture.id).sort(), [...CLASS_FIXTURES, 'two-rounds'].sort());
  for (const fixture of fixtures.filter((candidate) => CLASS_FIXTURES.includes(candidate.id))) {
    assert.ok(fixture.plants.length >= 2 && fixture.plants.length <= 3, `${fixture.id} plants ${fixture.plants.length}`);
    assert.equal(new Set(fixture.plants.map((plant) => plant.class)).size, 1, fixture.id);
  }
  const rounds = fixtures.find((fixture) => fixture.id === 'two-rounds').plants.map((plant) => plant.round);
  assert.deepEqual(rounds, [1, 2]);
});

test('every benchmarks/review-replay/<class>/ fixture plants ranges inside its stripped source', () => {
  for (const fixture of loadFixtures()) {
    const lines = fs.readFileSync(path.join(fixture.dir, `${fixture.file}.seed`), 'utf8').trimEnd().split('\n').length;
    assert.ok(fixture.plants.length > 0, fixture.id);
    for (const plant of fixture.plants) {
      const [start, end = start] = plant.range.split('-').map(Number);
      assert.equal(plant.path, fixture.file, fixture.id);
      assert.ok(start >= 1 && start <= end && end <= lines, `${fixture.id} ${plant.range}`);
    }
  }
});

test('the dead-code plants change no output when removed', async () => {
  const seed = fs.readFileSync(path.join(ROOT, 'benchmarks', 'review-replay', 'dead-code', 'report.js.seed'), 'utf8');
  const lines = seed.split('\n');
  const solution = lines.filter((_, index) => index !== 0 && (index < 2 || index > 5) && index !== 18 && (index < 22 || index > 24)).join('\n');
  const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const [planted, repaired] = await Promise.all([load(seed), load(solution)]);
  for (const rows of [[], [[]], [[], []], [['a']], [['a', 'b'], ['c"d']]]) {
    assert.equal(planted.formatReport('T', rows), repaired.formatReport('T', rows), JSON.stringify(rows));
  }
});

test('a fixture replays through the stubbed model from its staged .seed source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-replay-'));
  try {
    fs.mkdirSync(path.join(root, 'swallow'));
    fs.copyFileSync(path.join(ROOT, 'benchmarks', 'safe', TASK.id, 'seed', TASK.file), path.join(root, 'swallow', `${TASK.file}.seed`));
    fs.writeFileSync(path.join(root, 'swallow', 'plants.json'), JSON.stringify(PLANTS));
    const [cell] = await replayAll({ ...OPTIONS, tasks: loadFixtures(root), repeat: 1 }, () => scriptedModel([]));
    assert.deepEqual([cell.task, cell.failures, cell.roundsToClean.mean, cell.fixedAfterOneRepair.mean], ['swallow', 0, 2, 1]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the os temp folder is untouched by a finished replay', () => {
  assert.equal(fs.readdirSync(os.tmpdir()).some((name) => name.startsWith('review-replay-')), false);
});

function dryRun(...args) {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'benchmarks', 'review-replay.mjs'), '--dry-run', ...args], { encoding: 'utf8' });
  return { status: run.status, stderr: run.stderr, projection: run.status === 0 ? JSON.parse(run.stdout) : null };
}

test('dry-run projects the quick tier from the stored baseline: 2 cells, 0.85 usd, a 1.00 cap', () => {
  const { status, projection } = dryRun();
  assert.equal(status, 0);
  assert.equal(projection.mode, 'quick');
  assert.deepEqual(projection.cells.map((cell) => cell.task), ['copied-block', 'duplicate-truth-source']);
  assert.equal(projection.projectedUsd, 0.85);
  assert.equal(projection.budgetUsd, 1);
});

test('dry-run --full projects every fixture times three repeats with no budget', () => {
  const { status, projection } = dryRun('--full');
  assert.equal(status, 0);
  assert.equal(projection.mode, 'full');
  assert.equal(projection.cells.length, 21);
  assert.equal(projection.projectedUsd, 9.11);
  assert.equal(projection.budgetUsd, null);
});

test('dry-run exits 0 over the budget, and --task and --repeat override the tier', () => {
  const over = dryRun('--budget-usd', '0.5');
  assert.equal(over.status, 0);
  assert.deepEqual([over.projection.projectedUsd, over.projection.budgetUsd], [0.85, 0.5]);
  const picked = dryRun('--task', 'dead-code', '--repeat', '2');
  assert.deepEqual(picked.projection.cells.map((cell) => cell.task), ['dead-code', 'dead-code']);
  assert.equal(picked.projection.projectedUsd, 1.1);
  assert.equal(picked.projection.budgetUsd, 1);
});

test('dry-run: a real run whose projection is over the budget fails before its first model call', async () => {
  const calls = [];
  const modelFor = () => async (prompt) => {
    calls.push(prompt);
    return 0;
  };
  await assert.rejects(main(['--budget-usd', '0.5'], { modelFor }), /projected 0\.85 usd is over --budget-usd 0\.5/);
  assert.deepEqual(calls, []);
});

test('resume without --out fails before its first model call', async () => {
  const calls = [];
  const modelFor = () => async (prompt) => {
    calls.push(prompt);
    return 0;
  };
  await assert.rejects(main(['--resume'], { modelFor }), /--resume needs --out/);
  assert.deepEqual(calls, []);
});

const BASELINE_ROWS = [
  { task: 'copied-block', runs: 3, costUsdPerRun: 0.49, fixedAfterOneRepair: 0.33, neverClean: 1, model: 'old', source: 'old.md' },
  { task: 'dead-code', runs: 3, costUsdPerRun: 0.55, fixedAfterOneRepair: 1, neverClean: 1, model: 'old', source: 'old.md' }
];

function measuredCell(task, grade) {
  const run = { failure: null, roundsToClean: null, costUsd: 1, grade };
  return { ...summarize({ id: task }, [run, run]), skipped: 0 };
}

test('baseline: withBaseline attaches the stored row per task and the table prints it beside the result', () => {
  const cells = withBaseline([measuredCell('copied-block', { planted: 2, fixed: 2, falseFix: 0 }), measuredCell('new-task', null)], BASELINE_ROWS);
  assert.equal(cells[0].baseline, BASELINE_ROWS[0]);
  assert.equal(cells[1].baseline, null);
  const lines = renderTable(cells).trimEnd().split('\n');
  assert.match(lines[0], /\| baseline \|$/);
  assert.match(lines[2], /\| fixed 0\.33, never clean 1, \$0\.49\/run \|$/);
  assert.match(lines[3], /\| - \|$/);
});

test('baseline: --save-baseline rewrites the rows of the tasks run and keeps the others', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-baseline-'));
  try {
    const file = path.join(dir, 'baseline.json');
    fs.writeFileSync(file, JSON.stringify(BASELINE_ROWS));
    const cells = [measuredCell('dead-code', { planted: 2, fixed: 1, falseFix: 0 }), measuredCell('new-task', { planted: 1, fixed: 1, falseFix: 0 }), { ...measuredCell('skipped-task', null), runs: 0 }];
    saveBaseline(file, cells, { model: 'sonnet', source: 'run.md' });
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(saved.map((row) => row.task), ['copied-block', 'dead-code', 'new-task']);
    assert.deepEqual(saved[0], BASELINE_ROWS[0]);
    assert.deepEqual(saved[1], { task: 'dead-code', runs: 2, costUsdPerRun: 1, fixedAfterOneRepair: 0.5, neverClean: 2, model: 'sonnet', source: 'run.md' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function keepRun(keepDir, name, result) {
  fs.mkdirSync(path.join(keepDir, name), { recursive: true });
  fs.writeFileSync(path.join(keepDir, name, 'run.json'), JSON.stringify(result));
}

test('rescore rebuilds the cells, table and log from kept runs with zero model calls', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-rescore-'));
  try {
    const keepDir = path.join(dir, 'kept');
    const run = { failure: null, roundsToClean: 2, stopReason: null, durationMs: 5, costUsd: 0.4 };
    keepRun(keepDir, 'copied-block-r0', { ...run, grade: { planted: 2, fixed: 1, falseFix: 1 } });
    keepRun(keepDir, 'copied-block-r1', { ...run, grade: { planted: 2, fixed: 2, falseFix: 0 } });
    keepRun(keepDir, 'dead-code-r0', { ...run, roundsToClean: null, grade: null });
    keepRun(keepDir, 'copied-block-Xy12ab', { ...run, grade: { planted: 2, fixed: 2, falseFix: 0 } });
    const out = path.join(dir, 'report.md');
    const printed = spawnSync(process.execPath, [path.join(ROOT, 'benchmarks', 'review-replay.mjs'), '--rescore', keepDir, '--out', out], { encoding: 'utf8' });
    assert.equal(printed.status, 0, printed.stderr);
    const cells = JSON.parse(printed.stdout);
    assert.deepEqual(cells.map((cell) => [cell.task, cell.runs, cell.skipped, cell.neverClean, cell.fixedAfterOneRepair.mean]), [['copied-block', 2, 0, 0, 0.75], ['dead-code', 1, 0, 1, null]]);
    assert.equal(cells[0].baseline.task, 'copied-block');
    assert.match(fs.readFileSync(out, 'utf8'), /^\| task \|.*\n.*\n\| copied-block \| 2 \|/);
    const log = JSON.parse(fs.readFileSync(`${out}.json`, 'utf8'));
    assert.ok(Math.abs(log.cost_usd - 1.2) < 1e-9, `cost_usd ${log.cost_usd}`);
    assert.deepEqual(log.cells, cells);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resume skips a run already kept and joins its stored result to the cell', async () => {
  const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-resume-'));
  try {
    const stored = { task: TASK.id, failure: null, roundsToClean: 3, stopReason: null, grade: { planted: 1, fixed: 0, falseFix: 0 }, costUsd: 0.5, durationMs: 7 };
    keepRun(keepDir, `${TASK.id}-r0`, stored);
    const calls = [];
    const [cell] = await replayAll({ ...OPTIONS, repeat: 2, jobs: 1, keepDir, resume: true }, () => scriptedModel(calls, { costUsd: 0.25 }));
    assert.equal(cell.runs, 2);
    assert.equal(cell.skipped, 0);
    assert.equal(calls.filter((call) => call.includes('exo:fix-review')).length, 1);
    assert.equal(cell.costUsd, 1.25);
    assert.equal(cell.fixedAfterOneRepair.mean, 0.5);
    assert.deepEqual(fs.readdirSync(keepDir).sort(), [`${TASK.id}-r0`, `${TASK.id}-r1`]);
  } finally {
    fs.rmSync(keepDir, { recursive: true, force: true });
  }
});
