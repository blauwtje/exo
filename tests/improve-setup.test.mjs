import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { improveDefaults } from '../skills/build/scripts/round.mjs';
import { baselineNoise } from '../skills/build/scripts/baseline.mjs';
import { git, tempDir } from './harness.mjs';

const SETUP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'build', 'scripts', 'setup.mjs');

function repo() {
  const root = tempDir('improve-setup-');
  git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'code.txt'), 'hello world\n');
  fs.writeFileSync(path.join(root, 'check.mjs'), "import fs from 'node:fs';console.log('score ' + fs.readFileSync('code.txt','utf8').length);\n");
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  return root;
}

const run = (root, ...extra) => spawnSync('node', [SETUP, '--root', root, ...extra], { encoding: 'utf8' });
const base = ['--goal', 'g', '--command', 'node check.mjs', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--readonly', 'check.mjs', '--tag', 't1'];

test('setup creates branch, worktree, config, baseline row, brief and the settled line', () => {
  const root = repo();
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  const brief = path.join(fs.realpathSync(root), '.exo/improve/t1.brief.md');
  assert.match(result.stdout, /^tag=t1 branch=improve\/t1 worktree=\.worktrees\/improve-t1 score=12 limit=\d+ seed=1 sd=0 mde=0 holdout=none model=\S+ effort=\S+ noidea=\d+ mode=inline brief=\S+\n$/);
  assert.equal(fs.realpathSync(result.stdout.trim().split('brief=')[1]), brief);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8'));
  assert.deepEqual([cfg.scope, cfg.readOnly, cfg.direction, cfg.worktree], [['code.txt'], ['check.mjs'], 'higher', '.worktrees/improve-t1']);
  assert.match(cfg.scorerHash, /^[0-9a-f]{64}$/);
  const rows = fs.readFileSync(path.join(root, '.exo/improve/t1.tsv'), 'utf8').trim().split('\n');
  assert.equal(rows[0], 'commit\tscore\tstatus\tdescription');
  assert.match(rows[1], /^[0-9a-f]+\t12\tkeep\tbaseline$/);
  assert.match(fs.readFileSync(brief, 'utf8'), /best so far 12/);
  assert.ok(fs.existsSync(path.join(root, '.worktrees/improve-t1')));
});

test('setup scores the baseline baselineRuns times and stores the runs and ITEM scores as samples', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'check.mjs'), "import fs from 'node:fs';fs.appendFileSync('runs.log', 'run\\n');const n = fs.readFileSync('code.txt','utf8').length;console.log('ITEM a ' + n + '\\nITEM b 1\\nscore ' + n);\n");
  fs.writeFileSync(path.join(root, '.gitignore'), 'runs.log\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'items');
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  const runs = improveDefaults().baselineRuns;
  const [commit] = fs.readFileSync(path.join(root, '.exo/improve/t1.tsv'), 'utf8').trim().split('\n')[1].split('\t');
  const stored = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.samples.jsonl'), 'utf8'));
  assert.deepEqual(stored, { commit, status: 'keep', runs: Array(runs).fill(12), items: { a: Array(runs).fill(12), b: Array(runs).fill(1) }, aborted: 0 });
  assert.equal(fs.readFileSync(path.join(root, '.worktrees/improve-t1/runs.log'), 'utf8').trim().split('\n').length, runs);
});

test('the limit is derived from the baseline run unless --limit is given', () => {
  const root = repo();
  const derived = Number(run(root, ...base).stdout.match(/limit=(\d+)/)[1]);
  assert.ok(derived >= 61 && derived < 120, `limit ${derived}`);
  assert.match(run(root, ...base, '--tag', 't9', '--limit', '7').stdout, /limit=7 /);
});

test('setup commits a --scorer path on the improve branch only', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'score.mjs'), "console.log('score 5');\n");
  const result = run(root, '--goal', 'g', '--command', 'node score.mjs', '--regex', 'score (\\d+)', '--direction', 'lower', '--scope', 'code.txt', '--scorer', 'score.mjs', '--tag', 't2');
  assert.equal(result.status, 0, result.stderr);
  assert.match(git(root, 'show', '--stat', '--format=%s', 'improve/t2'), /frozen scorer[\s\S]*score\.mjs/);
  assert.equal(git(root, 'ls-tree', '--name-only', 'main').includes('score.mjs'), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t2.json'), 'utf8')).readOnly, ['score.mjs']);
});

test('resume resets the worktree to the last kept row and prints the settled line', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const tree = path.join(root, '.worktrees/improve-t1');
  const kept = git(tree, 'rev-parse', '--short', 'HEAD');
  fs.writeFileSync(path.join(tree, 'code.txt'), 'x\n');
  git(tree, 'commit', '-qam', 'unscored');
  const result = run(root, '--resume', '--tag', 't1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(tree, 'rev-parse', '--short', 'HEAD'), kept);
  assert.match(result.stdout, /^tag=t1 branch=improve\/t1 .*score=12 .*brief=\S+\n$/);
  assert.equal(run(root, '--resume').status, 0);
});

test('a scope over defaults.improve.inlineBytes settles in worker mode', () => {
  const root = repo();
  const home = tempDir('improve-home-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { improve: { inlineBytes: 5 } } }));
  const result = spawnSync('node', [SETUP, '--root', root, ...base], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, / mode=worker /);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8')).mode, 'worker');
});

test('a missing required flag is a usage error', () => {
  const result = run(repo(), '--goal', 'g');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--command is required/);
});

test('a second setup with a taken tag gets a numeric suffix', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const again = run(root, ...base);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /^tag=t1-2 branch=improve\/t1-2 worktree=\.worktrees\/improve-t1-2 /);
  assert.match(run(root, ...base).stdout, /^tag=t1-3 /);
});

test('no setup script swallows a failure', () => {
  const dir = path.dirname(SETUP);
  for (const name of ['setup.mjs', 'round.mjs']) assert.doesNotMatch(fs.readFileSync(path.join(dir, name), 'utf8'), /\} catch \{/);
});

test('a failed baseline run or scorer commit exits 2 and leaves no improve branch or worktree', () => {
  const root = repo();
  const wrong = run(root, '--goal', 'g', '--command', 'node check.mjs', '--regex', 'nomatch (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--tag', 't7');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /score command failed on the baseline run/);
  const failing = run(root, '--goal', 'g', '--command', 'false', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--tag', 't6');
  assert.equal(failing.status, 2);
  const missing = run(root, ...base, '--scorer', 'absent.mjs', '--tag', 't8');
  assert.equal(missing.status, 2);
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
  assert.doesNotMatch(git(root, 'worktree', 'list'), /improve-t[678]/);
});

test('a scope, readonly or scorer entry that is absolute or outside the repo fails before any branch or worktree', () => {
  const root = repo();
  const cases = [['--scope', '../outside', 'scope'], ['--scope', '/abs/src', 'scope'], ['--scope', 'src/../../x', 'scope'], ['--readonly', '../check.mjs', 'readonly'], ['--scorer', '/abs/score.mjs', 'scorer']];
  for (const [flag, value, name] of cases) {
    const result = run(root, ...base.filter((_, at) => base[at] !== flag && base[at - 1] !== flag), flag, value, '--tag', 'tx');
    assert.equal(result.status, 2, `${flag} ${value}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`--${name} entry`));
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  }
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
  assert.doesNotMatch(git(root, 'worktree', 'list'), /improve-tx/);
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('a read-only path that does not exist fails before any branch', () => {
  const root = repo();
  const result = run(root, ...base.slice(0, -2), '--readonly', 'nope.mjs', '--tag', 'ty');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /read-only path missing or empty: nope\.mjs/);
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
});

const identity = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const runFirst = (root, ...extra) => spawnSync('node', [SETUP, '--root', root, ...base, ...extra], { encoding: 'utf8', env: identity });

function firstDir(root, files) {
  const dir = path.join(root, '.exo', 'improve', 'first');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return path.relative(root, dir);
}

test('--first commits the files under its dir as round 1 and prints the round row after the settled line', () => {
  const root = repo();
  const result = runFirst(root, '--first', firstDir(root, { 'code.txt': 'hello wide world\n' }), '--first-subject', 'Widen the greeting');
  assert.equal(result.status, 0, result.stderr);
  const [settledLine, row] = result.stdout.trim().split('\n');
  assert.match(settledLine, /^tag=t1 .* score=12 .*mode=inline /);
  assert.match(row, /^ROW [0-9a-f]+ 17 keep best=17$/);
  const tree = path.join(root, '.worktrees/improve-t1');
  assert.equal(git(tree, 'log', '-1', '--format=%s'), 'Widen the greeting');
  assert.equal(fs.readFileSync(path.join(tree, 'code.txt'), 'utf8'), 'hello wide world\n');
  assert.equal(fs.existsSync(path.join(root, '.exo/improve/first')), false);
  assert.match(fs.readFileSync(path.join(root, '.exo/improve/t1.tsv'), 'utf8').trim().split('\n')[2], /\t17\tkeep\tlines=\+1\/-1; Widen the greeting$/);
});

test('--first that scores worse is discarded and the worktree is reset to the baseline', () => {
  const root = repo();
  const result = runFirst(root, '--first', firstDir(root, { 'code.txt': 'hi\n' }), '--first-subject', 'Shorten');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim().split('\n')[1], /^ROW [0-9a-f]+ 3 discard best=12$/);
  assert.match(result.stderr, /^OUT /m);
  assert.equal(fs.readFileSync(path.join(root, '.worktrees/improve-t1/code.txt'), 'utf8'), 'hello world\n');
});

test('--first with a read-only or out-of-scope file, no files or no subject fails before any branch', () => {
  const root = repo();
  const cases = [
    [['--first', firstDir(root, { 'check.mjs': 'x' }), '--first-subject', 's'], /--first file out of scope: check\.mjs/],
    [['--first', 'missing-dir', '--first-subject', 's'], /--first holds no files: missing-dir/],
    [['--first', '.exo/improve/first'], /--first and --first-subject go together/],
  ];
  for (const [extra, message] of cases) {
    const result = runFirst(root, ...extra);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, message);
  }
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
});

test('every baseline run gets the run seed as EXO_SEED and the seed is stored in the run state', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'check.mjs'), "import fs from 'node:fs';fs.appendFileSync('seeds.log', process.env.EXO_SEED + '\\n');console.log('score 12');\n");
  fs.writeFileSync(path.join(root, '.gitignore'), 'seeds.log\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'seeded');
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  const seed = String(improveDefaults().seed);
  assert.deepEqual(fs.readFileSync(path.join(root, '.worktrees/improve-t1/seeds.log'), 'utf8').trim().split('\n'), Array(improveDefaults().baselineRuns).fill(seed));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8')).seed, Number(seed));
  assert.match(result.stdout, new RegExp(` seed=${seed} `));
});

test('baseline noise is the SD of the baseline runs and mde the smallest gain the keep rule detects at maxRuns', () => {
  const defaults = { maxRuns: 3, keepZ: 1.96, keepFloor: 0 };
  assert.deepEqual(baselineNoise({ runs: [10, 12], items: {} }, defaults), { sd: 1.4142, mde: 2.5303 });
  assert.deepEqual(baselineNoise({ runs: [50, 60], items: { a: [20, 30], b: [80, 90] } }, defaults), { sd: 7.0711, mde: 8.9461 });
  assert.deepEqual(baselineNoise({ runs: [10, 10], items: {} }, { ...defaults, keepFloor: 0.5 }), { sd: 0, mde: 0.5 });
  assert.deepEqual(baselineNoise({ runs: [10], items: {} }, defaults), { sd: null, mde: null });
});

test('the brief names the smallest detectable gain and the simplicity rule', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const text = fs.readFileSync(path.join(root, '.exo/improve/t1.brief.md'), 'utf8');
  assert.match(text, /smallest gain the keep rule detects 0\./);
  assert.match(text, /Simpler wins at an equal score: a removal that keeps the score is a win; a gain near the smallest detectable gain that adds much code is not worth it/);
});

function itemRepo(count) {
  const root = repo();
  const lines = Array.from({ length: count }, (_, at) => `ITEM c${at} ${at * 10}`).join('\\n');
  fs.writeFileSync(path.join(root, 'check.mjs'), `console.log('${lines}\\nscore 999');\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'items');
  return root;
}

test('a score with no ITEM lines settles with holdout=none and stores no held-out cases', () => {
  const root = repo();
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, / holdout=none /);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8')).holdout, null);
});

test('fewer than holdoutMin ITEM ids hold none out and keep the command\'s score', () => {
  const root = itemRepo(improveDefaults().holdoutMin - 1);
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, / score=999 .* holdout=none /);
});

test('holdoutMin ITEM ids hold out a stable share, and the baseline score and samples use the tuning cases only', () => {
  const root = itemRepo(8);
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, / holdout=2\/8 /);
  const { held } = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8')).holdout;
  assert.equal(held.length, 2);
  const stored = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.samples.jsonl'), 'utf8'));
  assert.deepEqual(Object.keys(stored.held).sort(), held);
  assert.equal(Object.keys(stored.items).filter((id) => held.includes(id)).length, 0);
  const tune = Object.keys(stored.items).map((id) => Number(id.slice(1)) * 10);
  const mean = tune.reduce((sum, value) => sum + value, 0) / tune.length;
  assert.match(result.stdout, new RegExp(` score=${Number(mean.toFixed(4))} `));
  assert.match(run(root, '--resume', '--tag', 't1').stdout, / holdout=2\/8 /);
});
