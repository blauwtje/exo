import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeDefaultOptionsHome } from '../lib/default-options-home.mjs';
import { dryRunReport, makeRunFolder, readFlags, recordRun, recordedRuns, regradeFolder, writeGrades } from '../skills/edit-skills/scripts/pressure.mjs';

function git(cwd, home, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } });
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

function removeAll(paths) {
  for (const target of paths) if (target) fs.rmSync(target, { recursive: true, force: true });
}

test('a host without a git identity commits as the plan placeholder', () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-run-folder-home-'));
  const saved = { HOME: process.env.HOME, XDG: process.env.XDG_CONFIG_HOME, NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  let folder;
  try {
    process.env.HOME = emptyHome;
    process.env.XDG_CONFIG_HOME = path.join(emptyHome, 'xdg');
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    folder = makeRunFolder('with', undefined);
    assert.equal(git(folder.scratch, emptyHome, ['log', '-1', '--format=%an <%ae>']), 'pressure <pressure@localhost>');
  } finally {
    for (const [key, value] of [['HOME', saved.HOME], ['XDG_CONFIG_HOME', saved.XDG], ['GIT_CONFIG_NOSYSTEM', saved.NOSYSTEM]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeAll([emptyHome, folder && path.dirname(folder.scratch)]);
  }
});

test('the scratch folder is a git repository where a worktree commit works under the options-free HOME', () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-run-folder-home-'));
  const realHome = process.env.HOME;
  let mirror;
  let folder;
  try {
    process.env.HOME = emptyHome;
    mirror = makeDefaultOptionsHome();
    folder = makeRunFolder('with', undefined);
    const worktree = path.join(folder.tmp, 'agent-worktree');
    git(folder.scratch, mirror, ['worktree', 'add', worktree]);
    fs.writeFileSync(path.join(worktree, 'note.txt'), 'x\n');
    git(worktree, mirror, ['add', 'note.txt']);
    git(worktree, mirror, ['commit', '-m', 'note']);
    assert.equal(git(worktree, mirror, ['log', '-1', '--format=%s']), 'note');
  } finally {
    process.env.HOME = realHome;
    removeAll([emptyHome, mirror, folder && path.dirname(folder.scratch)]);
  }
});

test('a graded run records its duration and cost, and the grades file keeps both', () => {
  const grade = { case: 'a.md', arm: 'with', run: 1, lines: [] };
  const recorded = recordRun(grade, { cost: 0.25, durationMs: 1200 });
  assert.deepEqual(recorded, { ...grade, durationMs: 1200, cost_usd: 0.25 });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-grades-'));
  try {
    writeGrades(outDir, { 'sonnet:low': [recorded] });
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'grades.json'), 'utf8'));
    assert.equal(written['sonnet:low'].runs[0].durationMs, 1200);
    assert.equal(written['sonnet:low'].runs[0].cost_usd, 0.25);
    assert.deepEqual(recordedRuns(outDir).map((run) => run.cost_usd), [0.25]);
  } finally {
    removeAll([outDir]);
  }
});

test('a dry run counts sessions at the median recorded cost and counts the judge calls', () => {
  const recorded = [{ cost_usd: 0.1 }, { cost_usd: 0.3 }, { cost_usd: 0.2 }];
  const cells = [{ model: 'sonnet', effort: 'low' }, { model: 'haiku', effort: 'low' }];
  assert.equal(
    dryRunReport({ cells, runs: 3, judgeLines: 2, votes: 3 }, recorded),
    'dry-run: 12 sessions x median $0.2000 = $2.40; judge calls: 72 (at most, a run whose deterministic line fails skips them)'
  );
  assert.equal(
    dryRunReport({ cells, runs: 1, judgeLines: 0, votes: 3 }, []),
    'dry-run: 4 sessions, cost unknown; judge calls: 0 (at most, a run whose deterministic line fails skips them)'
  );
});

test('a missing grades file records no runs', () => {
  assert.deepEqual(recordedRuns(path.join(os.tmpdir(), 'pressure-no-such-dir')), []);
});

test('regrade grades the saved answers of a run folder, keeps their cost and starts no session', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-regrade-'));
  try {
    const criteriaFile = path.join(dir, 'criteria.md');
    fs.writeFileSync(criteriaFile, '- Says hi. `grade: answer =~ /hi/`\n- Kind. `grade: judge`\n');
    fs.writeFileSync(path.join(dir, 'claude-sonnet-4-low-with-1.md'), 'hi there');
    fs.writeFileSync(path.join(dir, 'claude-sonnet-4-low-without-1.md'), 'go away');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not an answer');
    writeGrades(dir, { 'claude-sonnet-4:low': [recordRun({ case: 'a.md', arm: 'with', run: 1, lines: [] }, { cost: 0.5, durationMs: 90 })] });
    const gradesByCell = regradeFolder(dir, { promptFile: 'a.md', grade: { criteriaFile, votes: 1 }, judge: () => 'PASS\nkind' });
    const runs = gradesByCell['claude-sonnet-4:low'];
    assert.deepEqual(runs.map((graded) => [graded.arm, graded.run, graded.lines.map((line) => line.pass)]), [['with', 1, [true, true]], ['without', 1, [false, false]]]);
    assert.deepEqual([runs[0].cost_usd, runs[0].durationMs, runs[1].cost_usd], [0.5, 90, undefined]);
  } finally {
    removeAll([dir]);
  }
});

test('regrade keeps the cost and the cell key of a model id that a file name changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-regrade-'));
  try {
    const criteriaFile = path.join(dir, 'criteria.md');
    fs.writeFileSync(criteriaFile, '- Says hi. `grade: answer =~ /hi/`\n');
    fs.writeFileSync(path.join(dir, 'opus_1m_-low-with-1.md'), 'hi');
    writeGrades(dir, { 'opus[1m]:low': [recordRun({ case: 'a.md', arm: 'with', run: 1, lines: [] }, { cost: 0.5, durationMs: 9 })] });
    const gradesByCell = regradeFolder(dir, { promptFile: 'a.md', grade: { criteriaFile, votes: 1 }, judge: () => 'PASS' });
    assert.deepEqual(Object.keys(gradesByCell), ['opus[1m]:low']);
    assert.equal(gradesByCell['opus[1m]:low'][0].cost_usd, 0.5);
  } finally {
    removeAll([dir]);
  }
});

function gradeArgs(...extra) {
  return ['--prompt', 'a.md', '--cells', 'sonnet:low', '--plugin-dir', '.', '--grade', '--criteria', 'tests/pressure-run-folder.test.mjs', ...extra];
}

test('the default is one run and one judge vote, and --full gives three of each', () => {
  const quick = readFlags(gradeArgs());
  assert.deepEqual([quick.mode, quick.runs, quick.grade.votes], ['quick', 1, 1]);
  const full = readFlags(gradeArgs('--full'));
  assert.deepEqual([full.mode, full.runs, full.grade.votes], ['full', 3, 3]);
});

test('an explicit --runs or --judge-votes overrides the tier and the mode stays quick', () => {
  const flags = readFlags(gradeArgs('--runs', '5', '--judge-votes', '2'));
  assert.deepEqual([flags.mode, flags.runs, flags.grade.votes], ['quick', 5, 2]);
});

test('grades.json records the mode of the run', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-mode-'));
  try {
    for (const mode of ['quick', 'full']) {
      writeGrades(outDir, { 'sonnet:low': [] }, { mode });
      assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, 'grades.json'), 'utf8'))['sonnet:low'].mode, mode);
    }
  } finally {
    removeAll([outDir]);
  }
});
