import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scorerHash } from '../skills/improve/scripts/round.mjs';

const script = fileURLToPath(new URL('../skills/improve/scripts/round.mjs', import.meta.url));
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();

function setup({ direction = 'lower', command = 'cat src/x.txt', limit = 20 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'round-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/x.txt'), 'score=10\npad\n');
  fs.writeFileSync(path.join(root, 'score.sh'), 'x\n');
  for (const args of [['init', '-q'], ['config', 'user.email', 'a@b.c'], ['config', 'user.name', 'a'], ['add', '-A'], ['commit', '-qm', 'base']]) git(root, ...args);
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '.exo/\nruns.log\n');
  const dir = path.join(root, '.exo/improve');
  fs.mkdirSync(dir, { recursive: true });
  const cfg = {
    goal: 'shrink x', scope: ['src'], readOnly: ['score.sh'], scorerHash: scorerHash(root, ['score.sh']), command, regex: 'score=(\\d+)', direction, limit,
    fastCheck: null, worktree: '.', model: 'strong', effort: 'high',
  };
  fs.writeFileSync(path.join(dir, 't.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 't.tsv'), `commit\tscore\tstatus\tdescription\n${git(root, 'rev-parse', '--short', 'HEAD')}\t10\tkeep\tbaseline\n`);
  return root;
}

function commitEdit(root, text, file = 'src/x.txt', subject = 'idea') {
  fs.writeFileSync(path.join(root, file), text);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', subject);
  return git(root, 'rev-parse', '--short', 'HEAD');
}

function round(root, commit, extra = []) {
  const run = spawnSync(process.execPath, [script, '--root', root, '--tag', 't', '--commit', commit, ...extra], { encoding: 'utf8' });
  return { out: run.stdout.trim(), status: run.status, err: run.stderr };
}

const rows = (root) => fs.readFileSync(path.join(root, '.exo/improve/t.tsv'), 'utf8').trim().split('\n');
const brief = (root) => fs.readFileSync(path.join(root, '.exo/improve/t.brief.md'), 'utf8');

test('keeps a better score, logs a row and rewrites the brief', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n', 'src/x.txt', 'shrink x');
  const { out, status } = round(root, commit);
  assert.equal(out, `ROW ${commit} 7 keep best=7`);
  assert.equal(status, 0);
  assert.equal(rows(root).at(-1), `${commit}\t7\tkeep\tshrink x`);
  assert.match(brief(root), new RegExp(`base commit \`${commit}\``));
  assert.match(brief(root), /best so far 7/);
});

test('discards a worse score and resets to the last keep', () => {
  const root = setup();
  const base = git(root, 'rev-parse', 'HEAD');
  const commit = commitEdit(root, 'score=12\n');
  assert.match(round(root, commit).out, /^ROW \S+ 12 discard best=10$/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.match(brief(root), /discard idea/);
});

test('equal score keeps only when the commit leaves fewer lines', () => {
  const root = setup();
  const more = commitEdit(root, 'score=10\npad\nextra\n');
  assert.match(round(root, more).out, /discard/);
  const less = commitEdit(root, 'score=10\n');
  assert.match(round(root, less).out, /keep/);
});

test('higher direction prefers a larger score', () => {
  const root = setup({ direction: 'higher' });
  assert.match(round(root, commitEdit(root, 'score=11\n')).out, /keep best=11/);
});

test('an out-of-scope diff is discarded without scoring', () => {
  const root = setup();
  const commit = commitEdit(root, 'other\n', 'lib.txt');
  assert.match(round(root, commit).out, /^ROW \S+ 10 discard/);
  assert.match(rows(root).at(-1), /file out of scope: lib\.txt/);
  assert.equal(fs.existsSync(path.join(root, 'lib.txt')), false);
});

test('a scored discard prints the score output tail on stderr, a keep prints none', () => {
  const root = setup();
  assert.equal(round(root, commitEdit(root, 'score=7\n')).err, '');
  const { out, err } = round(root, commitEdit(root, 'score=12\ncorrect=no\n'));
  assert.match(out, /^ROW \S+ 12 discard best=7$/);
  assert.equal(err, 'OUT score=12\nOUT correct=no\n');
});

test('a crash prints the error lines without stack frames', () => {
  const root = setup({ command: "printf 'file:///s.mjs:3\\nTypeError: x is not a function\\n    at sort (file:///s.mjs:3:5)\\n\\nNode.js v24.0.0\\n'; exit 1" });
  const { out, err } = round(root, commitEdit(root, 'score=7\n'));
  assert.match(out, /^ROW \S+ 0 crash best=10$/);
  assert.equal(err, 'OUT file:///s.mjs:3\nOUT TypeError: x is not a function\n');
});

test('a missing score is a crash row with score 0', () => {
  const root = setup({ command: 'echo nothing' });
  const commit = commitEdit(root, 'score=7\n');
  assert.match(round(root, commit).out, /^ROW \S+ 0 crash best=10$/);
  assert.match(rows(root).at(-1), /\tcrash\tcrash; /);
});

test('a run over the limit is killed and rerun once', () => {
  const root = setup({ command: 'echo run >> runs.log; sleep 30', limit: 1 });
  const commit = commitEdit(root, 'score=7\n');
  assert.match(round(root, commit).out, /crash/);
  assert.equal(fs.readFileSync(path.join(root, 'runs.log'), 'utf8').trim().split('\n').length, 2);
});

test('a changed scorer stops the run before scoring', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n');
  fs.writeFileSync(path.join(root, 'score.sh'), 'changed\n');
  const { out, status } = round(root, commit);
  assert.equal(out, 'STOP scorer-changed score-files');
  assert.equal(status, 1);
  assert.equal(rows(root).length, 2);
});

test('ten rounds without a keep stop the run', () => {
  const root = setup();
  const file = path.join(root, '.exo/improve/t.tsv');
  const filler = Array.from({ length: 9 }, (_, at) => `d${at}\t12\tdiscard\tidea`).join('\n');
  fs.appendFileSync(file, `${filler}\n`);
  const commit = commitEdit(root, 'score=12\n');
  const { out, status } = round(root, commit);
  assert.equal(out, `ROW ${commit} 12 discard best=10\nSTOP no-keep 10`);
  assert.equal(status, 0);
});

test('a failed reset stops the run and logs no row', () => {
  const root = setup();
  const file = path.join(root, '.exo/improve/t.tsv');
  fs.writeFileSync(file, 'commit\tscore\tstatus\tdescription\nbadbad1\t10\tkeep\tbaseline\n');
  const commit = commitEdit(root, 'score=12\n');
  const { out, status } = round(root, commit);
  assert.match(out, /^STOP reset-failed /);
  assert.equal(status, 1);
  assert.equal(rows(root).length, 2);
});

test('a scope entry git refuses discards the round with its message', () => {
  const root = setup();
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), scope: ['../outside'] }));
  const { out, status } = round(root, commitEdit(root, 'score=7\n'));
  assert.match(out, /^ROW \S+ 10 discard/);
  assert.equal(status, 0);
  assert.match(rows(root).at(-1), /scope check failed/);
});

test('requires --root, --tag and --commit', () => {
  const run = spawnSync(process.execPath, [script, '--root', '.', '--tag', 't'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--commit is required/);
});

test('the brief shows in-scope and read-only files at the kept commit', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n```\n');
  round(root, commit);
  const text = brief(root);
  assert.match(text, /### `src\/x\.txt`\n\n````\nscore=7\n```\n````/);
  assert.match(text, /### `score\.sh` \(read-only\)/);
});

test('scoring runs on the commit, not on uncommitted edits', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=12\n');
  fs.writeFileSync(path.join(root, 'src/x.txt'), 'score=1\n');
  const { out } = round(root, commit);
  assert.equal(out, `ROW ${commit} 12 discard best=10`);
});
