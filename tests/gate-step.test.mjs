import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runStage } from '../skills/gate/scripts/gate-step.mjs';
import { writePending } from '../skills/gate/scripts/repair-round.mjs';
import { recordedReview } from '../skills/gate/scripts/review-record.mjs';
import { decide, stopLine } from '../skills/gate/scripts/gate-decide.mjs';
import { outcome, outcomeLine } from '../lib/run-outcomes.mjs';

function gitRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'gate-step-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 't@example.com'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'seed'], { cwd: root });
  return root;
}

const base = { plan: 'plan.md', root: gitRoot(), base: 'main', reports: [], preFixSha: 'abc', findings: 'f.md', findingsSha256: 'h' };

function fullFlags() {
  return { ...base, root: gitRoot(), full: true };
}

function stub(outputs) {
  const calls = [];
  const run = (script, args) => {
    calls.push([script, ...args]);
    const out = outputs[script + (args.includes('--reviews-only') ? ':reviews' : '')];
    return { status: out.status ?? 0, stdout: out.stdout };
  };
  return { run, calls };
}

test('the start stage runs only the reviews-only pass and names the --full call', () => {
  const { run, calls } = stub({ 'gate.mjs:reviews': { stdout: 'REVIEW Branch x\nDISPATCH Branch: a\n' } });
  const { lines, status } = runStage('start', base, run);
  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(lines.filter((line) => line.startsWith('STEP ')), ['STEP reviews-only ok']);
  assert.ok(lines.some((line) => line.startsWith('DECIDE dispatch')));
  assert.ok(lines.some((line) => line.startsWith('NEXT') && line.includes('--full')));
});

test('the --full stage runs the full gate and writes timestamped progress lines', () => {
  const root = gitRoot();
  const { run, calls } = stub({ 'gate.mjs': { stdout: 'PASS a\n' } });
  const { lines } = runStage('start', { ...base, root, full: true }, run);
  assert.equal(calls.length, 1);
  assert.ok(lines.includes('STEP gate ok'));
  const progress = readFileSync(path.join(root, '.exo', 'gate-progress.log'), 'utf8').split('\n').filter(Boolean);
  assert.ok(progress.length >= 2);
  assert.ok(progress.every((line) => /^\d{4}-\d\d-\d\dT[\d:.]+Z /.test(line)));
});

test('a FAIL stops with DECIDE and one LOG digest line, never a log path', () => {
  const { run } = stub({ 'gate.mjs': { status: 1, stdout: 'PASS a\nFAIL success-criterion\n  not ok 1 - x\nREPORT r.md\n' } });
  const { lines, status } = runStage('start', fullFlags(), run);
  assert.equal(status, 1);
  assert.ok(lines.includes('STEP gate fail'));
  assert.equal(lines.filter((line) => line.startsWith('LOG gate ')).length, 1);
  assert.ok(lines.some((line) => line.startsWith('DECIDE FAIL')));
  assert.ok(!lines.some((line) => /\.log\b/.test(line)));
});

test('UNPLANNED also stops with DECIDE', () => {
  const { run } = stub({ 'gate.mjs:reviews': { stdout: '' }, 'gate.mjs': { status: 1, stdout: 'UNPLANNED x\n' } });
  assert.ok(runStage('start', fullFlags(), run).lines.some((line) => line.startsWith('DECIDE UNPLANNED')));
});

test('after review: question findings and the CODEX offer each give a DECIDE line', () => {
  const { run } = stub({ 'merge-reviews.mjs': { stdout: 'verdict=CLEAN defect=0 concern=0 question=1 note=0 fix=0 report=r\nFINDING a.mjs:1 question report\nCODEX offer\n' } });
  const { lines } = runStage('review', { ...base, root: gitRoot(), reports: ['a.md'] }, run);
  assert.ok(lines.includes('STEP merge ok'));
  assert.ok(lines.some((line) => line.startsWith('DECIDE question')));
  assert.ok(lines.some((line) => line.startsWith('DECIDE CODEX offer')));
});

test('after review: fix or concern counts and BLOCKED give a DECIDE line', () => {
  const { run } = stub({ 'merge-reviews.mjs': { stdout: 'verdict=FINDINGS defect=1 concern=0 question=0 note=0 fix=1 report=r\nBLOCKED recurring x y\nCODEX none\n' } });
  const { lines } = runStage('review', { ...base, reports: ['a.md'] }, run);
  assert.ok(lines.some((line) => line.startsWith('DECIDE repair')));
  assert.ok(lines.some((line) => line.startsWith('DECIDE BLOCKED')));
});

test('after fix: runs the repair recheck and the probes and decides on FAIL and on next=fix', () => {
  const { run, calls } = stub({ 'gate.mjs': { stdout: 'PASS fixer-committed\nLOOP next=fix round=1/2\n' }, 'run-probes.mjs': { status: 1, stdout: 'FAIL probe a\n' } });
  const { lines } = runStage('fix', base, run);
  assert.equal(calls.length, 2);
  assert.ok(lines.includes('STEP repair ok'));
  assert.ok(lines.includes('STEP probes fail'));
  assert.ok(lines.some((line) => line.startsWith('DECIDE FAIL')));
  assert.ok(lines.some((line) => line.startsWith('DECIDE loop')));
});

test('no NEXT line points at a reference path as a read instruction', () => {
  const { run } = stub({ 'gate.mjs:reviews': { stdout: 'DISPATCH Branch: a\n' }, 'gate.mjs': { stdout: 'SKIP x\nWARN y\nSELF-HOSTED z\n' } });
  const next = runStage('start', fullFlags(), run).lines.filter((line) => line.startsWith('NEXT '));
  assert.ok(next.length > 0);
  assert.ok(next.every((line) => !/references\/|\.md\b/.test(line)));
});

test('a red check names every FAIL, WARN and UNRUN check line in the LOG line', () => {
  const out = 'FAIL success-criterion (exit 1)\n  [PASS] a\n  [FAIL] lint-docs\n  [WARN] slow-suite\n  [UNRUN] browser\n  SUMMARY PASS=1 FAIL=1 WARN=1 UNRUN=1\n';
  const { run } = stub({ 'gate.mjs:reviews': { stdout: '' }, 'gate.mjs': { status: 1, stdout: out } });
  const log = runStage('start', fullFlags(), run).lines.find((line) => line.startsWith('LOG gate '));
  for (const name of ['[FAIL] lint-docs', '[WARN] slow-suite', '[UNRUN] browser']) assert.ok(log.includes(name), log);
});

test('a blocked merge names the blocked state and its clearing action, not repairs', () => {
  const { run } = stub({ 'merge-reviews.mjs': { stdout: 'verdict=BLOCKED defect=1 concern=0 question=0 note=0 fix=1 report=r\nCOVERAGE 2/3\nUNREAD-FILE a.mjs\n' } });
  const next = runStage('review', { ...base, reports: ['a.md'] }, run).lines.filter((line) => line.startsWith('NEXT '));
  assert.equal(next.length, 1);
  assert.match(next[0], /blocked/i);
  assert.ok(next[0].includes(outcomeLine('unread file')));
});

test('gate-decide prints each line from its outcome table row', () => {
  assert.equal(outcome('gate fail').action, 'repair');
  assert.ok(decide('FAIL', 'gate fail').startsWith('DECIDE FAIL repair: '));
  assert.ok(decide('UNPLANNED', 'outside Files').startsWith('DECIDE UNPLANNED amend: '));
  assert.equal(stopLine(), `STOP repair-bound: ${outcomeLine('repair bound')}`);
  assert.equal(outcome('repair bound').action, 'stop');
});

test('after review: a question finding is parked under .exo/questions', () => {
  const root = gitRoot();
  const { run } = stub({ 'merge-reviews.mjs': { stdout: 'verdict=CLEAN defect=0 concern=0 question=1 note=0 fix=0 report=r\nFINDING a.mjs:1 question report\nCODEX none\n' } });
  runStage('review', { ...base, root, reports: ['a.md'] }, run);
  assert.ok(existsSync(path.join(root, '.exo', 'questions')));
  assert.equal(readdirSync(path.join(root, '.exo', 'questions')).length, 1);
});

test('a full-stage gate FAIL repeated to the repair bound prints the stop row', () => {
  const flags = fullFlags();
  const { run } = stub({ 'gate.mjs': { status: 1, stdout: 'FAIL x\n' } });
  const decisions = [];
  for (let pass = 0; pass < 20; pass += 1) {
    const { lines } = runStage('start', flags, run);
    if (lines.includes(stopLine())) return assert.ok(decisions.length > 0);
    decisions.push(lines.filter((line) => line.startsWith('DECIDE FAIL')).length);
  }
  assert.fail('no stop row after 20 full-stage FAIL passes');
});

test('after review: the first merge records the reviewed sha and a later reviews-only run skips the full review', () => {
  const root = gitRoot();
  const { run } = stub({ 'merge-reviews.mjs': { stdout: 'verdict=CLEAN defect=0 concern=0 question=0 note=0 fix=0 report=r\nCODEX none\n' } });
  runStage('review', { ...base, root, reports: ['branch.md'] }, run);
  assert.equal(recordedReview(root).branch[0], 'branch.md');
});

function fixRound(root, round, content) {
  const preFixSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  writeFileSync(path.join(root, 'a.txt'), content);
  spawnSync('git', ['add', 'a.txt'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', `fix: round ${round}`], { cwd: root });
  const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  writePending(root, { round, commits: [sha], preFixSha, fixBefore: 1, fixAfter: 0 });
  return sha;
}

test('the review stage keeps a clean fix-diff review and reverts one with a new fix finding, moving it to report', () => {
  const root = gitRoot();
  const calls = [];
  const clean = 'verdict=CLEAN defect=0 concern=0 question=0 note=0 fix=0 report=r.md\n';
  const dirty = 'verdict=FINDINGS defect=1 concern=0 question=0 note=0 fix=1 report=r.md\nFINDING a.txt:1 defect 5 fix\n';
  const run = (script, args) => {
    calls.push(args);
    return { status: 0, stdout: calls.length === 1 ? clean : dirty };
  };
  fixRound(root, 1, 'kept\n');
  const first = runStage('review', { ...base, root, reports: ['r.md'] }, run);
  assert.ok(first.lines.every((line) => !line.startsWith('DISCARDED')));
  const keptSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const second = fixRound(root, 2, 'dropped\n');
  const result = runStage('review', { ...base, root, reports: ['r.md'] }, run);
  assert.ok(calls.every((args) => args.includes('--fix-base')));
  assert.ok(result.lines.some((line) => line.startsWith('DISCARDED round 2')));
  assert.ok(result.lines.includes('FINDING a.txt:1 defect 5 report'));
  assert.ok(!result.lines.some((line) => line.startsWith('DECIDE repair dispatch')));
  assert.equal(readFileSync(path.join(root, 'a.txt'), 'utf8'), 'kept\n');
  const subject = spawnSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8' }).stdout;
  assert.match(subject, /^Revert/);
  assert.notEqual(keptSha, second);
  const rows = readFileSync(path.join(root, '.exo', 'review-rounds.tsv'), 'utf8').trim().split('\n').slice(1);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /\tkept$/);
  assert.match(rows[1], /\tdiscarded$/);
});

test('a BLOCKED merge records no review', () => {
  const root = gitRoot();
  const run = () => ({ status: 0, stdout: 'verdict=BLOCKED defect=0\nBLOCKED: report missing x\n' });
  runStage('review', { ...base, root, reports: ['branch.md'] }, run);
  assert.equal(recordedReview(root), null);
});

test('a BLOCKED fix-diff merge leaves the pending round pending and keeps nothing', () => {
  const root = gitRoot();
  fixRound(root, 1, 'kept\n');
  const run = () => ({ status: 0, stdout: 'verdict=BLOCKED defect=0\nBLOCKED: report missing x\n' });
  runStage('review', { ...base, root, reports: ['r.md'] }, run);
  assert.ok(existsSync(path.join(root, '.exo', 'review-round-pending.json')));
  assert.equal(existsSync(path.join(root, '.exo', 'review-rounds.tsv')), false);
});

test('the repair route hands the fix-diff findings file to the settle step', () => {
  const text = readFileSync(new URL('../skills/gate/references/repair.md', import.meta.url), 'utf8');
  assert.match(text, /gate-step\.mjs --after review --report <checkout>\/\.exo\/fix-review\.md/);
  assert.doesNotMatch(text, /Run no `merge-reviews\.mjs` on that file/);
});
