import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runStage } from '../skills/gate/scripts/gate-step.mjs';

const base = { plan: 'plan.md', root: '/co', base: 'main', reports: [], preFixSha: 'abc', findings: 'f.md', findingsSha256: 'h' };

function fullFlags() {
  return { ...base, root: mkdtempSync(path.join(tmpdir(), 'gate-step-')), full: true };
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
  const root = mkdtempSync(path.join(tmpdir(), 'gate-step-'));
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
  const { lines } = runStage('review', { ...base, reports: ['a.md'] }, run);
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
  assert.match(next[0], /rerun/i);
  assert.ok(!/repair|fix-review/i.test(next[0]));
});
