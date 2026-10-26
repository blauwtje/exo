// verify.mjs --reviews-only prints the review dispatch fields, and merge-reviews.mjs prints the
// question and report findings with the Codex offer, so the lead reads neither file nor runs
// pick-reviewer separately.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';
import { codeStandardPath } from '../skills/verify/scripts/verify.mjs';
import { TASK_SPLIT_TOKENS } from '../lib/context-limits.mjs';
import { git } from './harness.mjs';
import { landingCheckout, editApp } from './land-task-fixture.mjs';

const SCRIPTS = fileURLToPath(new URL('../skills/verify/scripts/', import.meta.url));
const run = (name, args, env = {}) => execFileSync('node', [path.join(SCRIPTS, name), ...args], {
  encoding: 'utf8', env: { ...process.env, EXO_RUN: '', EXO_RUN_DIR: '', ...env }
});

async function landedBranch() {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  await editApp(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'proof-fixture-task-1.txt'), 'pass\n');
  return { root, planPath };
}

test('--reviews-only prints one DISPATCH line with the filled review fields', async () => {
  const { root, planPath } = await landedBranch();
  const output = run('verify.mjs', ['--plan', planPath, '--root', root, '--base', 'main', '--reviews-only']);
  const lines = output.trim().split('\n');
  assert.match(lines[0], /^REVIEW Branch main\.\.HEAD: review-branch/);
  const dispatch = lines.find((line) => line.startsWith('DISPATCH Branch: '));
  assert.ok(dispatch, output);
  const standard = path.join(path.dirname(SCRIPTS), '..', 'route-skills', 'references', 'code-standard.md');
  assert.ok(dispatch.includes(`code-standard=${path.resolve(standard)}`) || dispatch.includes(`code-standard=${standard}`), dispatch);
  assert.ok(dispatch.includes(`plan=${planPath}`));
  assert.ok(dispatch.includes(`checkout=${root}`));
  assert.ok(dispatch.includes('base=main'));
  assert.ok(dispatch.includes('scope=branch main..HEAD'));
  assert.ok(dispatch.includes(`findings=${path.join(root, '.exo', 'review-branch.md')}`));
  assert.ok(dispatch.includes(`proofs=${path.join(root, '.exo', 'proof-fixture-task-1.txt')}`));
  assert.ok(dispatch.includes('review-rules='));
  assert.ok(!output.includes('DISPATCH Overlap'), 'no overlap, no overlap dispatch');
});

test('the DISPATCH line leaves the REVIEW and OVERLAP lines the run tail parses as they were', async () => {
  const { root, planPath } = await landedBranch();
  const lines = run('verify.mjs', ['--plan', planPath, '--root', root, '--base', 'main', '--reviews-only']).trim().split('\n');
  assert.ok(lines.some((line) => /^REVIEW Branch ([^:]*): (review-branch)(?: exo-kind: (\S+))?\s*$/.test(line)));
  assert.ok(lines.includes('OVERLAP none'));
  assert.ok(lines.filter((line) => !/^(REVIEW|OVERLAP|DISPATCH) /.test(line)).length === 0, 'no other line is printed');
});

test('codeStandardPath names a file CLAUDE.md or AGENTS.md calls the code standard, else the plugin default', async () => {
  const { root } = await landingCheckout();
  assert.match(codeStandardPath(root), /route-skills[\\/]references[\\/]code-standard\.md$/);
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'style.md'), 'style\n');
  await fs.writeFile(path.join(root, 'AGENTS.md'), '- Code standard: `docs/style.md`\n');
  assert.equal(codeStandardPath(root), path.join(root, 'docs', 'style.md'));
  await fs.writeFile(path.join(root, 'AGENTS.md'), '- Code standard: `docs/missing.md`\n');
  assert.match(codeStandardPath(root), /code-standard\.md$/);
});

const REPORT = [
  'FINDINGS',
  '- src/a.js:3 defect fix',
  '  Probe: grep -q x src/a.js',
  '  Class: x',
  '  Sweep: grep -n x src/a.js',
  '- src/b.js:4 defect fix',
  '- src/c.js:5 question report',
  '- src/d.js:6 concern report',
  '- src/e.js:7 note report',
  ''
].join('\n');

test('mergeReviews lists the question and report findings, a demoted fix included, and not a probed fix', () => {
  const { shown } = mergeReviews([{ name: 'review-branch', text: REPORT }]);
  assert.deepEqual(shown, ['- src/b.js:4 defect report', '- src/c.js:5 question report', '- src/d.js:6 concern report', '- src/e.js:7 note report']);
});

const NO_SWEEP = ['FINDINGS', '- src/a.js:3 defect fix', '  Probe: true', '  Class: x', '- src/b.js:4 defect fix', '  Probe: true', '  Sweep: true', ''].join('\n');

test('mergeReviews demotes a fix line missing its Class or its Sweep line', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: NO_SWEEP }]);
  assert.equal(merged.counts.fix, 0);
  assert.equal(merged.demoted, 2);
  assert.deepEqual(merged.shown, ['- src/a.js:3 defect report', '- src/b.js:4 defect report']);
});

test('mergeReviews keeps a fix line with a Probe alone when it comes from the code-rules report', () => {
  const merged = mergeReviews([{ name: 'code-rules', text: NO_SWEEP }]);
  assert.equal(merged.counts.fix, 2);
  assert.equal(merged.demoted, 0);
});

test('merge-reviews.mjs prints the FINDING lines after its verdict line and the CODEX line last', async () => {
  const { root } = await landingCheckout();
  const report = path.join(root, 'review-branch.md');
  await fs.writeFile(report, REPORT);
  const bin = path.join(root, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  const lines = run('merge-reviews.mjs', ['--root', root, '--report', report], { PATH: `${bin}${path.delimiter}${process.env.PATH}` }).trim().split('\n');
  assert.match(lines[0], /^verdict=FINDINGS defect=2 concern=1 question=1 note=1 fix=1 report=/);
  assert.ok(lines.includes('FINDING - src/c.js:5 question report'));
  assert.equal(lines.at(-1), 'CODEX offer');
  const inRun = run('merge-reviews.mjs', ['--root', root, '--report', report], { PATH: `${bin}${path.delimiter}${process.env.PATH}`, EXO_RUN: '1', EXO_RUN_DIR: path.join(root, 'rundir') });
  assert.ok(inRun.trim().endsWith('CODEX none'));
  await assert.rejects(fs.access(path.join(root, 'rundir', 'decisions.md')), 'inside a run the merge records no decision');
});

test('the task list states the 15,000-token task cap that plan-check enforces', async () => {
  const taskList = await fs.readFile(path.join(SCRIPTS, '..', '..', 'spec', 'references', 'task-list.md'), 'utf8');
  assert.equal(TASK_SPLIT_TOKENS, 15_000);
  assert.ok(taskList.includes(`over ${TASK_SPLIT_TOKENS.toLocaleString('en-US')} fails`), 'task-list.md names the cap');
});

test('merge-reviews.mjs appends one ledger row per finding per round, the round counting up', async () => {
  const { root } = await landingCheckout();
  const report = path.join(root, 'review-branch.md');
  await fs.writeFile(report, [REPORT, 'src/f.js:8-9; defect; swallowed failure; catch drops error; fix', '  Probe: true', '  Class: swallowed failure', '  Sweep: true', ''].join('\n'));
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const ledger = path.join(root, '.exo', 'review-ledger.jsonl');
  const rows = async () => (await fs.readFile(ledger, 'utf8')).trim().split('\n').map((row) => JSON.parse(row));
  run('merge-reviews.mjs', ['--root', root, '--report', report]);
  const first = await rows();
  assert.equal(first.length, 6);
  assert.deepEqual(first[0], { round: 1, rule: 'defect', path: 'src/a.js', range: '3', weight: 'defect', state: 'open', head });
  assert.deepEqual(first[1], { round: 1, rule: 'defect', path: 'src/b.js', range: '4', weight: 'defect', state: 'reported', head });
  assert.deepEqual(first[2], { round: 1, rule: 'question', path: 'src/c.js', range: '5', weight: 'question', state: 'reported', head });
  assert.deepEqual(first[5], { round: 1, rule: 'swallowed failure', path: 'src/f.js', range: '8-9', weight: 'defect', state: 'open', head });
  run('merge-reviews.mjs', ['--root', root, '--report', report]);
  const all = await rows();
  assert.equal(all.length, 12);
  assert.deepEqual(new Set(all.slice(6).map((row) => row.round)), new Set([2]));
});

const FIX_LINE = (rule, file) => [`${file}:8-9; defect; ${rule}; catch drops error; fix`, '  Probe: true', `  Class: ${rule}`, '  Sweep: true', ''].join('\n');

async function reviewRound(root, text) {
  const report = path.join(root, 'review-branch.md');
  await fs.writeFile(report, text);
  return run('merge-reviews.mjs', ['--root', root, '--report', report]).trim().split('\n');
}

test('the same rule@path open in two consecutive rounds prints BLOCKED recurring with both readings', async () => {
  const { root } = await landingCheckout();
  const first = await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  assert.match(first[0], /^verdict=FINDINGS /);
  const second = await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js').replace('8-9', '10-11')}`);
  assert.match(second[0], /^verdict=BLOCKED /);
  assert.equal(second[1], 'BLOCKED recurring swallowed failure src/f.js');
  assert.equal(second[2], '  round 1: src/f.js:8-9 defect');
  assert.equal(second[3], '  round 2: src/f.js:10-11 defect');
  assert.match(await fs.readFile(path.join(root, '.exo', 'branch-review.md'), 'utf8'), /^BLOCKED\n/);
});

test('a fixed row for that round, or another path, clears the recurrence', async () => {
  const { root } = await landingCheckout();
  await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  const ledger = path.join(root, '.exo', 'review-ledger.jsonl');
  await fs.appendFile(ledger, `${JSON.stringify({ round: 1, rule: 'swallowed failure', path: 'src/f.js', range: '8-9', weight: 'defect', state: 'fixed', head: null })}\n`);
  const again = await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  assert.match(again[0], /^verdict=FINDINGS /);
  const other = await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/g.js')}`);
  assert.match(other[0], /^verdict=FINDINGS /);
});

test('the DISPATCH Branch line carries ledger= only once the ledger holds a row', async () => {
  const { root, planPath } = await landedBranch();
  const dispatch = () => run('verify.mjs', ['--plan', planPath, '--root', root, '--base', 'main', '--reviews-only']).split('\n').find((line) => line.startsWith('DISPATCH Branch: '));
  assert.ok(!dispatch().includes('ledger='));
  await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  assert.ok(dispatch().endsWith(` ledger=${path.join(root, '.exo', 'review-ledger.jsonl')}`), dispatch());
});

const reviewInputOf = async (root, planPath) => {
  run('verify.mjs', ['--plan', planPath, '--root', root, '--base', 'main', '--reviews-only']);
  return fs.readFile(path.join(root, '.exo', 'review-input.md'), 'utf8');
};

test('--reviews-only writes review-input.md with the goal, non-goals, branch diff and code standard', async () => {
  const { root, planPath } = await landedBranch();
  const input = await reviewInputOf(root, planPath);
  assert.match(input, /The fixture proves the plan reader\./);
  assert.match(input, /`src\/other\.js` stays as it is\./);
  assert.match(input, /\+\s+return "hello";/);
  assert.ok(input.includes(`code-standard=${codeStandardPath(root)}`), input);
  assert.ok(!input.includes('ledger'), 'no ledger summary before the first round');
});

test('review-input.md names the changed paths and the git diff command when the diff passes 20,000 bytes', async () => {
  const { root, planPath } = await landedBranch();
  await fs.writeFile(path.join(root, 'src', 'big.js'), `${'export const filler = 1;\n'.repeat(1000)}`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): big');
  const input = await reviewInputOf(root, planPath);
  assert.ok(!input.includes('export const filler'), 'the big diff is not inlined');
  assert.ok(input.includes('src/big.js') && input.includes('src/app.js'), input);
  assert.ok(input.includes('git diff main..HEAD'), input);
});

test('review-input.md summarises the ledger rows by round once the ledger holds a row', async () => {
  const { root, planPath } = await landedBranch();
  await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  const input = await reviewInputOf(root, planPath);
  assert.ok(input.includes('round 1: swallowed failure@src/f.js:8-9 defect open'), input);
});

test('--reviews-only rewrites review-input.md each round', async () => {
  const { root, planPath } = await landedBranch();
  await reviewInputOf(root, planPath);
  await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  assert.ok((await reviewInputOf(root, planPath)).includes('round 1:'));
});

test('a CLEAN round between two rounds with the same finding keeps them from counting as consecutive', async () => {
  const { root } = await landingCheckout();
  await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  const clean = await reviewRound(root, 'CLEAN\n');
  assert.match(clean[0], /^verdict=CLEAN /);
  const third = await reviewRound(root, `FINDINGS\n${FIX_LINE('swallowed failure', 'src/f.js')}`);
  assert.match(third[0], /^verdict=FINDINGS /, third.join('\n'));
});

test('one reader parses .exo/review-ledger.jsonl', async () => {
  const merge = await fs.readFile(path.join(SCRIPTS, 'merge-reviews.mjs'), 'utf8');
  const verify = await fs.readFile(path.join(SCRIPTS, 'verify.mjs'), 'utf8');
  const summary = verify.slice(verify.indexOf('function ledgerSummary'), verify.indexOf('function reviewInputDiff'));
  assert.match(summary, /ledgerRows\(checkout\)/);
  assert.doesNotMatch(summary, /JSON\.parse/);
  assert.equal((merge.match(/JSON\.parse/g) ?? []).length, 1);
});
