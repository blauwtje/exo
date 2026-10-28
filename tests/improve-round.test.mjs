import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/improve/scripts/round.mjs', import.meta.url));
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();
const key = (lever) => ({ area: 'a', lever, target: 't' });
const idea = (lever, extra = {}) => ({ key: key(lever), parts: [key(lever)], files: ['src/x.txt'], evidence: 'src/x.txt:1 is slow', ...extra });

function setup({ direction = 'lower', command = 'cat src/x.txt', limit = 20 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'round-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/x.txt'), 'score=10\npad\n');
  fs.writeFileSync(path.join(root, 'score.sh'), 'x\n');
  for (const args of [['init', '-q'], ['config', 'user.email', 'a@b.c'], ['config', 'user.name', 'a'], ['add', '-A'], ['commit', '-qm', 'base']]) git(root, ...args);
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '.exo/\nruns.log\n');
  const dir = path.join(root, '.exo/improve');
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash('sha256').update('x\n').digest('hex');
  fs.writeFileSync(path.join(dir, 't.json'), JSON.stringify({ scope: ['src'], readOnly: ['score.sh'], hashes: { 'score.sh': hash }, command, regex: 'score=(\\d+)', direction, sd: 0, limit }));
  fs.writeFileSync(path.join(dir, 't.tsv'), `commit\tscore\tstatus\tdescription\n${git(root, 'rev-parse', '--short', 'HEAD')}\t10\tkeep\tbaseline\n`);
  return root;
}

function commitEdit(root, text, file = 'src/x.txt') {
  fs.writeFileSync(path.join(root, file), text);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'idea');
  return git(root, 'rev-parse', '--short', 'HEAD');
}

function round(root, commit, body) {
  const { flags = [], ...idea } = body;
  const file = path.join(root, '.exo/improve/t.idea.json');
  fs.writeFileSync(file, JSON.stringify(idea));
  const run = spawnSync(process.execPath, [script, '--root', root, '--tag', 't', '--commit', commit, '--idea', file, ...flags], { encoding: 'utf8' });
  return { out: run.stdout.trim(), status: run.status };
}

const rows = (root) => fs.readFileSync(path.join(root, '.exo/improve/t.tsv'), 'utf8').trim().split('\n');
const ideas = (root) => fs.readFileSync(path.join(root, '.exo/improve/t.ideas.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('keeps a better score, logs a row and an ideas line', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n');
  const { out } = round(root, commit, idea('one'));
  assert.equal(out, `ROW ${commit} 7 keep best=7`);
  assert.equal(rows(root).length, 3);
  assert.ok(ideas(root)[0].at);
  assert.equal(fs.readFileSync(path.join(root, '.exo/improve/t.status'), 'utf8').trim(), out);
});

test('discards a worse score and resets to the last keep', () => {
  const root = setup();
  const base = git(root, 'rev-parse', 'HEAD');
  const commit = commitEdit(root, 'score=12\n');
  assert.match(round(root, commit, idea('one')).out, /^ROW \S+ 12 discard best=10$/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
});

test('equal score keeps only when the commit leaves less code', () => {
  const root = setup();
  const more = commitEdit(root, 'score=10\npad\nextra\n');
  assert.match(round(root, more, idea('one')).out, /discard/);
  const less = commitEdit(root, 'score=10\n');
  assert.match(round(root, less, idea('two')).out, /keep/);
});

test('higher direction prefers a larger score', () => {
  const root = setup({ direction: 'higher' });
  assert.match(round(root, commitEdit(root, 'score=11\n'), idea('one')).out, /keep best=11/);
});

test('a changed scorer stops the run before scoring', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n');
  fs.writeFileSync(path.join(root, 'score.sh'), 'changed\n');
  const { out, status } = round(root, commit, idea('one'));
  assert.equal(out, 'STOP scorer-changed score.sh');
  assert.equal(status, 1);
});

test('an out-of-scope diff is discarded without scoring', () => {
  const root = setup();
  const commit = commitEdit(root, 'other\n', 'lib.txt');
  assert.match(round(root, commit, idea('one', { files: ['src/x.txt'] })).out, /discard/);
  assert.match(rows(root).at(-1), /out of scope/);
});

test('a gate reject is discarded and its key stays free', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n');
  assert.match(round(root, commit, idea('one', { evidence: 'vibes' })).out, /discard/);
  assert.equal(ideas(root)[0].crash, true);
});

test('a missing score is a crash row with score 0 after one rerun', () => {
  const root = setup({ command: 'echo nothing' });
  const commit = commitEdit(root, 'score=7\n');
  assert.match(round(root, commit, idea('one')).out, /^ROW \S+ 0 crash best=10$/);
});

test('a run over the limit is killed and rerun once', () => {
  const root = setup({ command: 'echo run >> runs.log; sleep 30', limit: 1 });
  const commit = commitEdit(root, 'score=7\n');
  assert.match(round(root, commit, idea('one')).out, /crash/);
  assert.equal(fs.readFileSync(path.join(root, 'runs.log'), 'utf8').trim().split('\n').length, 2);
});

test('--wait prints the status line, or WAIT when none arrives', () => {
  const root = setup();
  const run = (env) => spawnSync(process.execPath, [script, '--root', root, '--tag', 't', '--wait'], { encoding: 'utf8', env: { ...process.env, ...env } }).stdout.trim();
  assert.equal(run({ EXO_IMPROVE_WAIT_MS: '300' }), 'WAIT');
  fs.writeFileSync(path.join(root, '.exo/improve/t.status'), 'ROW abc 1 keep best=1\n');
  assert.equal(run({}), 'ROW abc 1 keep best=1');
});

test('--adopt cherry-picks a prepared commit, scores it, and refuses a conflict', () => {
  const root = setup();
  git(root, 'branch', 'next');
  git(root, 'checkout', '-q', 'next');
  const prepared = commitEdit(root, 'score=6\n');
  git(root, 'checkout', '-q', '-');
  const { out } = round(root, prepared, idea('one', { flags: ['--adopt'] }));
  assert.match(out, /^ROW \S+ 6 keep best=6$/);
  git(root, 'checkout', '-q', 'next');
  const clash = commitEdit(root, 'score=5\nmore\n');
  git(root, 'checkout', '-q', '-');
  commitEdit(root, 'score=6\nother\n');
  assert.equal(round(root, clash, idea('two', { flags: ['--adopt'] })).out, 'REFUSED cherry-pick conflict');
});

test('the row description is the commit subject', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n');
  round(root, commit, idea('one'));
  assert.equal(rows(root).at(-1).split('\t')[3], 'idea');
});

test('a glob scope entry lets a matching commit be scored', () => {
  const root = setup();
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), scope: ['src/*.txt'] }));
  const commit = commitEdit(root, 'score=7\n');
  assert.match(round(root, commit, idea('one')).out, /^ROW \S+ 7 keep/);
});

test('a failed reset stops the run and logs no row', () => {
  const root = setup();
  const file = path.join(root, '.exo/improve/t.tsv');
  fs.writeFileSync(file, 'commit\tscore\tstatus\tdescription\nbadbad1\t10\tkeep\tbaseline\n');
  const commit = commitEdit(root, 'score=12\n');
  const { out, status } = round(root, commit, idea('one'));
  assert.match(out, /^STOP reset-failed /);
  assert.equal(status, 1);
  assert.equal(rows(root).length, 2);
});

test('a scope entry git refuses discards the round and --adopt refuses it, with no stall', () => {
  const root = setup();
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), scope: ['../outside'] }));
  const commit = commitEdit(root, 'score=7\n');
  const { out, status } = round(root, commit, idea('one'));
  assert.match(out, /^ROW \S+ 10 discard/);
  assert.equal(status, 0);
  assert.match(rows(root).at(-1), /scope check failed/);
  const adopted = round(root, commit, idea('two', { flags: ['--adopt'] }));
  assert.match(adopted.out, /^REFUSED .*scope check failed/);
  assert.equal(adopted.status, 0);
});

function configure(root, extra) {
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...extra }));
}

// A fake score command that prints the next score of a fixed sequence on each run, wherever HEAD is.
function sequence(root, scores) {
  fs.writeFileSync(path.join(root, '.exo/seq.json'), JSON.stringify(scores));
  fs.writeFileSync(path.join(root, '.exo/seq.mjs'), "import fs from 'node:fs';const s=JSON.parse(fs.readFileSync('.exo/seq.json','utf8'));const n=fs.existsSync('.exo/seq.n')?Number(fs.readFileSync('.exo/seq.n','utf8')):0;fs.writeFileSync('.exo/seq.n',String(n+1));fs.appendFileSync('.exo/seq.heads',process.argv[2]+'\\n');console.log('score='+s[n]);\n");
  return { command: 'node .exo/seq.mjs "$(git rev-parse --short HEAD)"', regex: 'score=([\\d.]+)' };
}
const scored = (root) => fs.readFileSync(path.join(root, '.exo/seq.heads'), 'utf8').trim().split('\n');

test('--keep-margin keeps only a gain over k*sd, and a simpler commit only on a gain from 0 up to the margin', () => {
  const root = setup();
  configure(root, { sd: 1, keepMargin: 2 });
  const base = git(root, 'rev-parse', 'HEAD');
  assert.match(round(root, commitEdit(root, 'score=9\npad\n'), idea('one')).out, /^ROW \S+ 9 discard best=10$/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.match(round(root, commitEdit(root, 'score=13\n'), idea('two')).out, /discard/);
  assert.match(round(root, commitEdit(root, 'score=9\n'), idea('three')).out, /^ROW \S+ 9 keep best=9$/);
  assert.match(round(root, commitEdit(root, 'score=6\nmore\n'), idea('four')).out, /^ROW \S+ 6 keep best=6$/);
});

test('--confirm rescores candidate and last keep in the same round and keeps on the means', () => {
  const root = setup();
  const base = git(root, 'rev-parse', '--short', 'HEAD');
  configure(root, { sd: 1, keepMargin: 1, confirm: true, ...sequence(root, [7, 8, 10]) });
  const commit = commitEdit(root, 'score=0\npad\n');
  assert.equal(round(root, commit, idea('one')).out, `ROW ${commit} 7.5 keep best=7.5`);
  assert.deepEqual(scored(root), [commit, commit, base]);
  assert.equal(git(root, 'rev-parse', '--short', 'HEAD'), commit);
  assert.notEqual(git(root, 'symbolic-ref', '-q', 'HEAD'), '');
  assert.match(rows(root).at(-1), /\t7\.5\tkeep\tconfirm: candidate 7,8, kept fresh 10 pool mean 10; idea$/);
});

test('--confirm discards when the means miss the margin, resets, and pools the kept scores next time', () => {
  const root = setup();
  const base = git(root, 'rev-parse', 'HEAD');
  configure(root, { sd: 1, keepMargin: 1, confirm: true, ...sequence(root, [7, 11, 9, 8, 9, 10]) });
  assert.match(round(root, commitEdit(root, 'score=0\npad\n'), idea('one')).out, /^ROW \S+ 9 discard best=10$/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.equal(ideas(root).at(-1).status, 'discard');
  // screen 8 beats the pool [10, 9] (mean 9.5) by 1.5 > 1; candidate mean 8.5 vs pool [10, 9, 10] mean 9.67 keeps.
  assert.match(round(root, commitEdit(root, 'score=0\npad\n'), idea('two')).out, /^ROW \S+ 8\.5 keep/);
  assert.match(rows(root).at(-1), /pool mean 9\.66/);
});

test('--confirm is skipped when the screened score misses the margin', () => {
  const root = setup();
  configure(root, { sd: 1, keepMargin: 1, confirm: true, ...sequence(root, [9.5]) });
  assert.match(round(root, commitEdit(root, 'score=0\npad\n'), idea('one')).out, /^ROW \S+ 9\.5 discard/);
  assert.equal(scored(root).length, 1);
});

test('--stop-after n prints STOP no-keep n after n rounds without a keep, and a keep resets the count', () => {
  const root = setup();
  configure(root, { stopAfter: 2 });
  assert.match(round(root, commitEdit(root, 'score=12\n'), idea('one')).out, /^ROW \S+ 12 discard best=10$/);
  assert.match(round(root, commitEdit(root, 'score=7\n'), idea('two')).out, /^ROW \S+ 7 keep/);
  assert.match(round(root, commitEdit(root, 'score=12\n'), idea('three')).out, /^ROW \S+ 12 discard best=7$/);
  const { out, status } = round(root, commitEdit(root, 'nothing\n'), idea('four'));
  assert.match(out, /^ROW \S+ 0 crash best=7\nSTOP no-keep 2$/);
  assert.equal(status, 0);
  assert.equal(fs.readFileSync(path.join(root, '.exo/improve/t.status'), 'utf8').trim(), 'STOP no-keep 2');
});
