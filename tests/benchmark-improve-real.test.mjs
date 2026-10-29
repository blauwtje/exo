import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPLITS,
  buildArmCopy,
  gains,
  heldOutItems,
  leakScan,
  locateScore,
  pristineView,
  routingScore,
  scorerSpend,
  scorerView,
  spendRefusal
} from '../benchmarks/improve-real-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-real-test-'));
const copies = {};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

before(() => {
  for (const target of ['routing', 'locate']) {
    copies[target] = buildArmCopy({ repo: REPO, target, dest: path.join(scratch, `${target}-copy`) });
  }
});

test('the routing arm copy holds only train prompts and no results folder', () => {
  const { dest, fixtureCommit } = copies.routing;
  const prompts = readJson(path.join(dest, SPLITS.routing.data));
  assert.equal(fixtureCommit, null);
  assert.ok(prompts.length > 0);
  assert.ok(prompts.every((entry) => entry.split === 'train'));
  assert.equal(fs.existsSync(path.join(dest, 'benchmarks/results')), false);
  assert.equal(git(dest, 'rev-list', '--count', '--all'), '1');
});

test('the locate arm copy holds only train briefs on a leak-free fixture root commit', () => {
  const { dest, fixtureCommit } = copies.locate;
  const briefs = readJson(path.join(dest, SPLITS.locate.data));
  assert.deepEqual(briefs.briefs.map((brief) => brief.id).sort(), [...SPLITS.locate.train].sort());
  assert.equal(briefs.commit, fixtureCommit);
  assert.equal(git(dest, 'rev-list', '--count', '--all'), '2');
  assert.equal(git(dest, 'rev-parse', 'HEAD~1'), fixtureCommit);
  const fixtureFiles = git(dest, 'ls-tree', '-r', '--name-only', fixtureCommit).split('\n');
  assert.ok(fixtureFiles.length > 100);
  assert.equal(fixtureFiles.some((file) => file.startsWith('benchmarks/results/')), false);
});

test('a built copy of the real repository passes the leak scan for both targets', () => {
  for (const target of ['routing', 'locate']) {
    const items = heldOutItems(REPO, target);
    assert.ok(items.prompts.length > 0);
    assert.deepEqual(leakScan(copies[target].dest, target, { items }), []);
  }
});

test('the real repository carries held-out text only in the data files and the results folder', () => {
  for (const target of ['routing', 'locate']) {
    const files = new Set(leakScan(REPO, target, { history: false }).map((hit) => hit.file));
    const unexpected = [...files].filter((file) => file !== SPLITS[target].data && !file.startsWith('benchmarks/results/'));
    assert.deepEqual(unexpected, []);
  }
});

test('the leak scan finds a planted held-out prompt, a planted brief and a prompt hidden in history', () => {
  const routing = heldOutItems(REPO, 'routing');
  const locate = heldOutItems(REPO, 'locate');
  const dir = path.join(scratch, 'planted');
  fs.cpSync(copies.locate.dest, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.md'), `see: ${locate.prompts[0]}\n`);
  const brief = locate.briefs[1];
  fs.writeFileSync(path.join(dir, 'list.txt'), `${brief.id}\n${brief.expected.join('\n')}\n`);
  const hits = leakScan(dir, 'locate', { items: locate, history: false });
  assert.deepEqual(hits.map((hit) => `${hit.file}:${hit.kind}`).sort(), ['list.txt:brief', 'notes.md:prompt']);

  const routingDir = path.join(scratch, 'planted-routing');
  fs.cpSync(copies.routing.dest, routingDir, { recursive: true });
  fs.writeFileSync(path.join(routingDir, 'x.json'), JSON.stringify({ q: routing.prompts[0] }));
  const [escaped] = leakScan(routingDir, 'routing', { items: routing, history: false });
  assert.equal(escaped.file, 'x.json');

  git(dir, 'add', '--all');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'plant');
  fs.rmSync(path.join(dir, 'notes.md'));
  git(dir, 'add', '--all');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'unplant');
  const later = leakScan(dir, 'locate', { items: locate });
  assert.ok(later.some((hit) => hit.file === 'history:notes.md'));
});

test('an expected file alone is not a leak', () => {
  const locate = heldOutItems(REPO, 'locate');
  const brief = locate.briefs[0];
  const dir = path.join(scratch, 'ordinary');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'code.mjs'), `export const name = '${brief.id}';\n// ${brief.expected[0]}\n`);
  assert.deepEqual(leakScan(dir, 'locate', { items: locate, history: false }), []);
});

test('scorerView keeps only the ids of its split', () => {
  const routingDir = path.join(scratch, 'view-routing');
  fs.mkdirSync(path.join(routingDir, 'benchmarks/routing'), { recursive: true });
  fs.copyFileSync(path.join(REPO, SPLITS.routing.data), path.join(routingDir, SPLITS.routing.data));
  scorerView(routingDir, 'routing', 'held-out');
  const prompts = readJson(path.join(routingDir, SPLITS.routing.data));
  assert.ok(prompts.length > 0 && prompts.every((entry) => entry.split === 'held-out'));

  const locateDir = path.join(scratch, 'view-locate');
  fs.mkdirSync(path.join(locateDir, 'benchmarks/locate-recall'), { recursive: true });
  fs.copyFileSync(path.join(REPO, SPLITS.locate.data), path.join(locateDir, SPLITS.locate.data));
  scorerView(locateDir, 'locate', 'held-out', 'abc123');
  const briefs = readJson(path.join(locateDir, SPLITS.locate.data));
  assert.deepEqual(briefs.briefs.map((brief) => brief.id).sort(), [...SPLITS.locate.heldOut].sort());
  assert.equal(briefs.commit, 'abc123');
});

test('the locate split covers every brief once', () => {
  const all = readJson(path.join(REPO, SPLITS.locate.data)).briefs.map((brief) => brief.id).sort();
  assert.deepEqual([...SPLITS.locate.train, ...SPLITS.locate.heldOut].sort(), all);
});

test('the pristine held-out view has the held-out ids and the arm target text', () => {
  const dest = path.join(scratch, 'pristine');
  pristineView({ repo: REPO, target: 'locate', split: 'held-out', targetText: 'arm text\n', dest });
  const briefs = readJson(path.join(dest, SPLITS.locate.data));
  assert.deepEqual(briefs.briefs.map((brief) => brief.id).sort(), [...SPLITS.locate.heldOut].sort());
  assert.equal(fs.readFileSync(path.join(dest, SPLITS.locate.file), 'utf8'), 'arm text\n');
  assert.equal(git(dest, 'cat-file', '-t', briefs.commit), 'commit');
});

test('routingScore reads the find-cause recall and treats no data as zero', () => {
  const out = { results: { 'sonnet:low': { hook: { train: { 'find-cause': { recall: 2 / 3 } } } } } };
  assert.equal(routingScore(out), 2 / 3);
  assert.equal(routingScore({ results: { 'sonnet:low': { hook: { train: { 'find-cause': { recall: null } } } } } }), 0);
  assert.equal(routingScore({}), 0);
});

test('locateScore averages per-brief F1 and counts an error or null precision as zero', () => {
  const out = {
    sessions: [
      { brief: 'a', recall: 1, precision: 0.5 },
      { brief: 'a', recall: 1, precision: 1 },
      { brief: 'b', recall: 1, precision: 1, error: 'timeout' },
      { brief: 'c', recall: 1, precision: null },
      { brief: 'd', recall: 0, precision: 0 }
    ]
  };
  const first = (2 * 0.5) / 1.5;
  assert.ok(Math.abs(locateScore(out) - (((first + 1) / 2) + 0 + 0 + 0) / 4) < 1e-12);
  assert.equal(locateScore({ sessions: [{ brief: 'a', recall: 1, precision: 1 }] }), 1);
  assert.equal(locateScore({ sessions: [] }), 0);
});

test('scorerSpend sums session costs and skips missing ones', () => {
  assert.ok(Math.abs(scorerSpend({ sessions: [{ cost_usd: 0.1 }, { cost_usd: null }, { cost_usd: 0.25 }] }) - 0.35) < 1e-12);
  assert.equal(scorerSpend({}), 0);
});

test('spendRefusal passes at the cap and refuses above it', () => {
  assert.equal(spendRefusal({ spent: 1, projected: 1, cap: 2 }), null);
  assert.match(spendRefusal({ spent: 1.5, projected: 0.6, cap: 2 }), /\$2\.10 > \$2\.00/);
});

test('gains subtract the baseline and average a list of held-out scores', () => {
  const baseline = { routing: { train: 0.5, heldOut: 0.25 } };
  const result = gains({ train: 0.75, heldOut: [0.25, 0.75] }, baseline, 'routing');
  assert.equal(result.train, 0.25);
  assert.equal(result.heldOut, 0.25);
  assert.throws(() => gains({ train: 1, heldOut: 1 }, baseline, 'locate'), /baseline has no 'locate'/);
});
