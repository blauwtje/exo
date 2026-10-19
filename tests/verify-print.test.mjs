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
  '- src/b.js:4 defect fix',
  '- src/c.js:5 question report',
  '- src/d.js:6 concern report',
  ''
].join('\n');

test('mergeReviews lists the question and report findings, a demoted fix included, and not a probed fix', () => {
  const { shown } = mergeReviews([{ name: 'review-branch', text: REPORT }]);
  assert.deepEqual(shown, ['- src/b.js:4 defect report', '- src/c.js:5 question report', '- src/d.js:6 concern report']);
});

test('merge-reviews.mjs prints the FINDING lines after its verdict line and the CODEX line last', async () => {
  const { root } = await landingCheckout();
  const report = path.join(root, 'review-branch.md');
  await fs.writeFile(report, REPORT);
  const bin = path.join(root, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  const lines = run('merge-reviews.mjs', ['--root', root, '--report', report], { PATH: `${bin}${path.delimiter}${process.env.PATH}` }).trim().split('\n');
  assert.match(lines[0], /^verdict=FINDINGS defect=2 concern=1 question=1 fix=1 report=/);
  assert.ok(lines.includes('FINDING - src/c.js:5 question report'));
  assert.equal(lines.at(-1), 'CODEX offer');
  const inRun = run('merge-reviews.mjs', ['--root', root, '--report', report], { PATH: `${bin}${path.delimiter}${process.env.PATH}`, EXO_RUN: '1', EXO_RUN_DIR: path.join(root, 'rundir') });
  assert.ok(inRun.trim().endsWith('CODEX none'));
  await assert.rejects(fs.access(path.join(root, 'rundir', 'decisions.md')), 'inside a run the merge records no decision');
});
