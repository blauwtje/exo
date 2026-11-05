import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { planHoldout } from '../lib/holdout.mjs';
import { caseMovers, improveDefaults, judgeKeep, scorerHash } from '../skills/improve/scripts/round.mjs';

const script = fileURLToPath(new URL('../skills/improve/scripts/round.mjs', import.meta.url));
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();

function setup({ direction = 'lower', command = 'cat src/x.txt', limit = 20, baseline = [10, 10], items = {}, score = 10, regex = 'score=(\\d+)' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'round-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/x.txt'), 'score=10\npad\n');
  fs.writeFileSync(path.join(root, 'score.sh'), 'x\n');
  for (const args of [['init', '-q'], ['config', 'user.email', 'a@b.c'], ['config', 'user.name', 'a'], ['add', '-A'], ['commit', '-qm', 'base']]) git(root, ...args);
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '.exo/\nruns.log\n');
  const dir = path.join(root, '.exo/improve');
  fs.mkdirSync(dir, { recursive: true });
  const cfg = {
    goal: 'shrink x', scope: ['src'], readOnly: ['score.sh'], scorerHash: scorerHash(root, ['score.sh']), command, regex, direction, limit,
    fastCheck: null, worktree: '.', model: 'strong', effort: 'high',
  };
  fs.writeFileSync(path.join(dir, 't.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 't.tsv'), `commit\tscore\tstatus\tdescription\n${git(root, 'rev-parse', '--short', 'HEAD')}\t${score}\tkeep\tbaseline\n`);
  if (baseline) fs.writeFileSync(path.join(dir, 't.samples.jsonl'), `${JSON.stringify({ commit: git(root, 'rev-parse', '--short', 'HEAD'), status: 'keep', runs: baseline, items, aborted: 0 })}\n`);
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
const runCount = (root) => fs.readFileSync(path.join(root, 'runs.log'), 'utf8').trim().split('\n').length;
const samples = (root) => fs.readFileSync(path.join(root, '.exo/improve/t.samples.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const SEQUENCE = 'n=$(( $(cat .exo/n 2>/dev/null || echo 0) + 1 )); echo $n > .exo/n; echo run >> runs.log; cat .exo/seq/$n.txt';

function sequence(root, outputs) {
  fs.mkdirSync(path.join(root, '.exo/seq'), { recursive: true });
  outputs.forEach((text, at) => fs.writeFileSync(path.join(root, `.exo/seq/${at + 1}.txt`), text));
}

const brief = (root) => fs.readFileSync(path.join(root, '.exo/improve/t.brief.md'), 'utf8');

test('keeps a better score, logs a row and rewrites the brief', () => {
  const root = setup();
  const commit = commitEdit(root, 'score=7\n', 'src/x.txt', 'shrink x');
  const { out, status } = round(root, commit);
  assert.equal(out, `ROW ${commit} 7 keep best=7`);
  assert.equal(status, 0);
  assert.equal(rows(root).at(-1), `${commit}\t7\tkeep\tlines=+1/-2; shrink x`);
  assert.match(brief(root), new RegExp(`base commit \`${commit}\``));
  assert.match(brief(root), /best so far 7/);
});

test('discards a worse score and resets to the last keep', () => {
  const root = setup();
  const base = git(root, 'rev-parse', 'HEAD');
  const commit = commitEdit(root, 'score=12\n');
  assert.match(round(root, commit).out, /^ROW \S+ 12 discard best=10$/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.match(brief(root), /discard lines=\+1\/-2; idea/);
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
  assert.match(rows(root).at(-1), /\tcrash\tcrash lines=\+1\/-2; /);
});

test('a run over the limit is killed and ends the round as a timeout with no score, never rerun or kept', () => {
  const root = setup({ command: 'echo run >> runs.log; echo score=7; sleep 30', limit: 1 });
  const base = git(root, 'rev-parse', 'HEAD');
  const commit = commitEdit(root, 'score=7\n');
  const { out, err } = round(root, commit);
  assert.equal(out, `ROW ${commit} - timeout best=10`);
  assert.equal(runCount(root), 1);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.equal(rows(root).at(-1), `${commit}\t-\ttimeout\ttimeout over 1s lines=+1/-2; idea`);
  assert.deepEqual(samples(root).at(-1).runs, []);
  assert.match(err, /^OUT score=7$/m);
  assert.match(brief(root), new RegExp(`${commit} - timeout`));
});

test('a timeout after a valid run still ends the round as a timeout', () => {
  const root = setup({ command: SEQUENCE, limit: 1, baseline: [10, 12], score: 11 });
  sequence(root, ['score=10\n', 'score=7\n']);
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), command: `${SEQUENCE}; [ $n -lt 2 ] || sleep 30` }));
  const commit = commitEdit(root, 'score=7\n');
  assert.equal(round(root, commit).out, `ROW ${commit} - timeout best=11`);
  assert.equal(runCount(root), 2);
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

test('replay: the recorded 0dc2ee2e runs 100, 50 and 37.5 against the 46.3 baseline are discarded after three runs', () => {
  const root = setup({ direction: 'higher', command: SEQUENCE, baseline: [46.3], score: 46.3, regex: 'SCORE (-?[0-9.]+)' });
  sequence(root, ['DETAIL wins=8/8\nSCORE 100.00\n', 'DETAIL wins=4/8\nSCORE 50.00\n', 'DETAIL wins=3/8\nSCORE 37.50\n']);
  const base = git(root, 'rev-parse', 'HEAD');
  const commit = commitEdit(root, 'score=10\npad\nart in a delegate\n', 'src/x.txt', 'design-ui writes the art module in a parallel delegate');
  assert.match(round(root, commit).out, new RegExp(`^ROW ${commit} 62.5 discard best=46.3$`));
  assert.equal(runCount(root), 3);
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.match(rows(root).at(-1), /\t62\.5\tdiscard\tn=3 se=38\.188\d* lo=-58\.64\d* hi=91\.04\d* aborted=0 lines=\+1\/-0; design-ui writes/);
  assert.deepEqual(samples(root).at(-1), { commit, status: 'discard', runs: [100, 50, 37.5], items: {}, aborted: 0 });
  assert.deepEqual(fs.readdirSync(path.join(root, '.exo/improve/t.logs')).sort(), [1, 2, 3].map((at) => `${commit}-${at}.log`));
  assert.equal(fs.readFileSync(path.join(root, '.exo/improve/t.logs', `${commit}-1.log`), 'utf8'), 'DETAIL wins=8/8\nSCORE 100.00\n');
});

test('a deterministic score keeps, discards and ties on one run, with today\'s rows', () => {
  const root = setup({ command: 'echo run >> runs.log; cat src/x.txt' });
  const better = commitEdit(root, 'score=7\npad\n', 'src/x.txt', 'lower');
  assert.equal(round(root, better).out, `ROW ${better} 7 keep best=7`);
  assert.equal(runCount(root), 1);
  const worse = commitEdit(root, 'score=9\npad\n', 'src/x.txt', 'higher');
  assert.equal(round(root, worse).out, `ROW ${worse} 9 discard best=7`);
  assert.equal(runCount(root), 2);
  const tie = commitEdit(root, 'score=7\n', 'src/x.txt', 'shorter');
  assert.equal(round(root, tie).out, `ROW ${tie} 7 keep best=7`);
  assert.equal(runCount(root), 3);
  assert.deepEqual(rows(root).slice(-3).map((line) => line.split('\t').slice(1).join(' ')), ['7 keep lines=+1/-1; lower', '9 discard lines=+1/-1; higher', '7 keep lines=+0/-1; shorter']);
  assert.deepEqual(samples(root).map((entry) => entry.runs), [[10, 10], [7], [9], [7]]);
});

test('the kept commit\'s samples become the next baseline', () => {
  const root = setup({ direction: 'higher', command: SEQUENCE, regex: 'score=(\\d+)' });
  sequence(root, ['score=20\n', 'score=20\n']);
  const kept = commitEdit(root, 'a\n');
  assert.match(round(root, kept).out, /^ROW \S+ 20 keep best=20$/);
  const next = commitEdit(root, 'b\n');
  assert.match(round(root, next).out, /^ROW \S+ 20 discard best=20$/);
  assert.equal(runCount(root), 2);
});

test('a state with no stored samples falls back to the kept score and reruns once for variance', () => {
  const root = setup({ command: 'echo run >> runs.log; cat src/x.txt', baseline: null });
  const commit = commitEdit(root, 'score=7\n', 'src/x.txt', 'lower');
  assert.equal(round(root, commit).out, `ROW ${commit} 7 keep best=7`);
  assert.equal(runCount(root), 2);
  assert.equal(rows(root).at(-1), `${commit}\t7\tkeep\tn=2 se=0 lo=3 hi=3 aborted=0 lines=+1/-2; lower`);
});

test('ITEM lines pair the candidate with the kept commit per item and decide on one run', () => {
  const root = setup({ direction: 'higher', command: SEQUENCE, baseline: [50, 60], items: { a: [20, 30], b: [80, 90] }, score: 55 });
  sequence(root, ['ITEM a 27\nITEM b 87\nscore=57\n']);
  const commit = commitEdit(root, 'paired\n');
  const { out, err } = round(root, commit);
  assert.match(out, /^ROW \S+ 57 keep best=57$/);
  assert.equal(err, 'CASES a 25->27, b 85->87\n');
  assert.match(brief(root), new RegExp(`## Last round\n\n\`\`\`\nROW ${commit} 57 keep best=57\nCASES a 25->27, b 85->87\n\`\`\``));
  assert.equal(runCount(root), 1);
  assert.deepEqual(samples(root).at(-1).items, { a: [27], b: [87] });
});

test('a run with no score is left out and counted as aborted, the next valid run decides', () => {
  const root = setup({ command: SEQUENCE });
  sequence(root, ['no score here\n', 'score=7\n']);
  const commit = commitEdit(root, 'x\n', 'src/x.txt', 'retry');
  assert.equal(round(root, commit).out, `ROW ${commit} 7 keep best=7`);
  assert.equal(runCount(root), 2);
  assert.equal(rows(root).at(-1), `${commit}\t7\tkeep\tn=1 se=0 lo=3 hi=3 aborted=1 lines=+1/-2; retry`);
  assert.equal(samples(root).at(-1).aborted, 1);
});

test('a noisy tie keeps a shrinking commit only after maxRuns runs with no loss', () => {
  const cfg = { direction: 'higher' };
  const best = { runs: [10, 12], items: {} };
  assert.equal(judgeKeep({ cfg, best, samples: { runs: [11], items: {} }, shrinks: true, maxRuns: 3 }).verdict, 'repeat');
  assert.equal(judgeKeep({ cfg, best, samples: { runs: [11, 10, 12], items: {} }, shrinks: true, maxRuns: 3 }).verdict, 'keep');
  assert.equal(judgeKeep({ cfg, best, samples: { runs: [11, 10, 12], items: {} }, shrinks: false, maxRuns: 3 }).verdict, 'discard');
  assert.equal(judgeKeep({ cfg, best, samples: { runs: [11, 10, 11], items: {} }, shrinks: true, maxRuns: 3 }).verdict, 'discard');
});

test('every round score run gets the stored seed as EXO_SEED', () => {
  const root = setup({ command: 'echo "$EXO_SEED" >> runs.log; cat src/x.txt' });
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), seed: 42 }));
  round(root, commitEdit(root, 'score=7\n'));
  assert.equal(fs.readFileSync(path.join(root, 'runs.log'), 'utf8'), '42\n');
});

test('a candidate that is not exactly one commit on the kept commit is refused unscored', () => {
  const root = setup({ command: 'echo run >> runs.log; cat src/x.txt' });
  const base = git(root, 'rev-parse', '--short', 'HEAD');
  commitEdit(root, 'score=8\n', 'src/x.txt', 'first');
  const two = commitEdit(root, 'score=7\n', 'src/x.txt', 'second');
  assert.equal(round(root, two).out, `ROW ${two} - not-one-commit best=10`);
  assert.match(rows(root).at(-1), new RegExp(`\t-\tnot-one-commit\t2 commits on ${base}, want one; second$`));
  assert.equal(round(root, base).out, `ROW ${base} - not-one-commit best=10`);
  git(root, 'checkout', '-q', '--orphan', 'other');
  const stray = commitEdit(root, 'score=1\n', 'src/x.txt', 'stray');
  git(root, 'checkout', '-q', '-');
  assert.equal(round(root, stray).out, `ROW ${stray} - not-one-commit best=10`);
  assert.match(rows(root).at(-1), new RegExp(`not on ${base}, want one`));
  assert.equal(fs.existsSync(path.join(root, 'runs.log')), false);
  assert.equal(git(root, 'rev-parse', '--short', 'HEAD'), base);
});

test('CASES lists the largest per-case moves first, capped, and says when none moved', () => {
  const best = { items: { a: [1], b: [10, 12], c: [5], d: [3] } };
  assert.equal(caseMovers(best, { items: { a: [2], b: [8], c: [5], d: [9] } }, 2), 'CASES d 3->9, b 11->8');
  assert.equal(caseMovers(best, { items: { a: [1], c: [5] } }, 2), 'CASES none moved');
  assert.equal(caseMovers(best, { items: {} }, 2), null);
  assert.equal(caseMovers(best, undefined, 2), null);
});

test('a discard prints CASES before the OUT tail and the brief carries both', () => {
  const root = setup({ direction: 'higher', command: SEQUENCE, baseline: [50, 50], items: { a: [20, 20], b: [80, 80] }, score: 50 });
  sequence(root, ['ITEM a 10\nITEM b 80\nscore=45\n']);
  const commit = commitEdit(root, 'worse\n');
  const { out, err } = round(root, commit);
  assert.match(out, /^ROW \S+ 45 discard best=50$/);
  assert.equal(err, 'CASES a 20->10\nOUT ITEM a 10\nOUT ITEM b 80\nOUT score=45\n');
  assert.match(brief(root), /## Last round\n\n```\nROW \S+ 45 discard best=50\nCASES a 20->10\nOUT ITEM a 10\n/);
});

const IDS = Array.from({ length: 8 }, (_, at) => `c${at}`);
const HOLDOUT = planHoldout(IDS, { holdoutMin: 8, holdoutShare: 0.25 });
const isHeld = (id) => HOLDOUT.held.includes(id);
const itemText = (value) => `${IDS.map((id) => `ITEM ${id} ${value(id)}`).join('\n')}\nscore=999\n`;
const report = (root) => spawnSync(process.execPath, [script, '--root', root, '--tag', 't', '--report'], { encoding: 'utf8' }).stdout.trim();

function holdoutSetup() {
  const pick = (held) => Object.fromEntries(IDS.filter((id) => isHeld(id) === held).map((id) => [id, [50, 50]]));
  const root = setup({ direction: 'higher', command: SEQUENCE, baseline: [50, 50], items: pick(false), score: 50 });
  const file = path.join(root, '.exo/improve/t.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), holdout: HOLDOUT }));
  const stored = path.join(root, '.exo/improve/t.samples.jsonl');
  fs.writeFileSync(stored, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(stored, 'utf8')), held: pick(true) })}\n`);
  return root;
}

test('with held-out cases the row scores the tuning cases only and no log, OUT, CASES or brief line shows a held-out case', () => {
  const root = holdoutSetup();
  sequence(root, [itemText((id) => (isHeld(id) ? 77 : 40))]);
  const commit = commitEdit(root, 'worse\n');
  const { out, err } = round(root, commit);
  assert.match(out, /^ROW \S+ 40 discard best=50$/);
  const shown = [err, brief(root), fs.readFileSync(path.join(root, '.exo/improve/run.log'), 'utf8'), fs.readFileSync(path.join(root, `.exo/improve/t.logs/${commit}-1.log`), 'utf8')].join('\n');
  for (const id of HOLDOUT.held) assert.doesNotMatch(shown, new RegExp(`\\b${id}\\b`));
  assert.doesNotMatch(shown, /\b(?:999|77)\b/);
  assert.match(err, /^CASES c\d 50->40/);
  assert.deepEqual(Object.keys(samples(root).at(-1).held).sort(), HOLDOUT.held);
});

test('a keep whose held-out cases clearly drop becomes discard-holdout and resets to the kept commit', () => {
  const root = holdoutSetup();
  const base = git(root, 'rev-parse', '--short', 'HEAD');
  const drops = Object.fromEntries(HOLDOUT.held.map((id, at) => [id, 20 + at * 10]));
  sequence(root, [itemText((id) => (isHeld(id) ? drops[id] : 60))]);
  const commit = commitEdit(root, 'overfit\n');
  assert.equal(round(root, commit).out, `ROW ${commit} 60 discard-holdout best=50`);
  assert.equal(git(root, 'rev-parse', '--short', 'HEAD'), base);
  assert.match(rows(root).at(-1), /\t60\tdiscard-holdout\t/);
});

test('a keep with steady held-out cases stays a keep and --report prints held-out best against the baseline', () => {
  const root = holdoutSetup();
  assert.equal(report(root), 'HOLDOUT baseline=50 best=50 diff=0 lo=0 hi=0 cases=2');
  const lifts = Object.fromEntries(HOLDOUT.held.map((id, at) => [id, 52 + at * 2]));
  sequence(root, [itemText((id) => (isHeld(id) ? lifts[id] : 60))]);
  const commit = commitEdit(root, 'better\n');
  assert.equal(round(root, commit).out, `ROW ${commit} 60 keep best=60`);
  assert.equal(report(root), 'HOLDOUT baseline=50 best=53 diff=3 lo=1.04 hi=4.96 cases=2');
});

test('--report prints HOLDOUT none for a run with no held-out cases', () => {
  const root = setup();
  assert.equal(report(root), 'HOLDOUT none');
});
