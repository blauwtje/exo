// pick-reviewer.mjs picks the review agent by risk, not size; the command itself prints only the review effort.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { codexOffer, FILE_LIMIT, LINE_LIMIT, REVIEWER_AGENTS, parseNumstat, pickEffort, pickReviewer, signatureChangedSince, touchesManifest } from '../skills/verify/scripts/pick-reviewer.mjs';
import { readKindTable } from '../lib/model-kinds.mjs';
import { commitFiles, git, gitRepository, run } from './harness.mjs';

const { light, deep } = REVIEWER_AGENTS;
const AGENTS_DIRECTORY = fileURLToPath(new URL('../agents/', import.meta.url));

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/pick-reviewer.mjs', import.meta.url));

const NO_RISK = { riskTasks: false, manifestChanged: false, signatureChanged: false };

test('picks the plain reviewer agent when no risk fact holds, however large the diff', () => {
  assert.equal(pickReviewer(NO_RISK), light);
});

test('picks the deep reviewer agent when any one risk fact holds', () => {
  assert.equal(pickReviewer({ ...NO_RISK, riskTasks: true }), deep);
  assert.equal(pickReviewer({ ...NO_RISK, manifestChanged: true }), deep);
  assert.equal(pickReviewer({ ...NO_RISK, signatureChanged: true }), deep);
});

test('touchesManifest reads a manifest or lockfile anywhere in the paths', () => {
  assert.equal(touchesManifest(['src/app.js', 'web/package-lock.json']), true);
  assert.equal(touchesManifest(['src/app.js']), false);
});

test('the light pick is an agent file and the deep pick is that agent with the review-deep call model and effort', async () => {
  const { model, effort } = readKindTable().kinds['review-deep'];
  await fs.access(path.join(AGENTS_DIRECTORY, `${light}.md`));
  assert.equal(light, 'review-branch');
  assert.equal(deep, `review-branch model=${model} effort=${effort}`);
});

test('signatureChangedSince reads a Signature trailer or a script commit missing a Plan-task trailer, never a merge', async () => {
  const root = await gitRepository({ 'app.js': 'export const a = 1;\n' });
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'commit', '--allow-empty', '-m', 'feat: plain', '-m', 'Plan-task: plan/1');
  assert.equal(signatureChangedSince(base, root), false);
  git(root, 'commit', '--allow-empty', '-m', 'feat: breaking', '-m', 'Plan-task: plan/2\nSignature: app.js:a(x) -> (x, y)');
  assert.equal(signatureChangedSince(base, root), true);
  const second = git(root, 'rev-parse', 'HEAD');
  assert.equal(signatureChangedSince(second, root), false);
  await commitFiles(root, { 'app.js': 'export const a = 2;\n' }, 'fix: review fix');
  assert.equal(signatureChangedSince(second, root), true);
});

test('signatureChangedSince ignores a changelog-only commit missing a Plan-task trailer', async () => {
  const root = await gitRepository({ 'app.js': 'export const a = 1;\n', 'CHANGELOG.md': '# Changelog\n' });
  const base = git(root, 'rev-parse', 'HEAD');
  await commitFiles(root, { 'CHANGELOG.md': '# Changelog\n\n- a line\n' }, 'docs(changelog): record the change');
  assert.equal(signatureChangedSince(base, root), false);
});

test('the command prints no reviewer, so verify.mjs holds the only pick', async () => {
  const root = await gitRepository({ 'app.js': 'export const a = 1;\n' });
  const result = await run(SCRIPT, ['--base', 'HEAD'], { cwd: root });
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
});

test('parseNumstat sums numstat lines and treats a binary marker as zero', () => {
  assert.deepEqual(parseNumstat('5\t2\tfoo.js\n1\t0\tbar.js\n'), { files: 2, changedLines: 8 });
  assert.deepEqual(parseNumstat('-\t-\timage.png\n'), { files: 1, changedLines: 0 });
  assert.deepEqual(parseNumstat(''), { files: 0, changedLines: 0 });
});

test('pickEffort follows the D5 edges', () => {
  assert.equal(pickEffort({ files: 2, changedLines: 0, manifestChanged: false }), 'skip');
  assert.equal(pickEffort({ files: 2, changedLines: 0, manifestChanged: true }), 'low');
  assert.equal(pickEffort({ files: FILE_LIMIT, changedLines: LINE_LIMIT, manifestChanged: false }), 'low');
  assert.equal(pickEffort({ files: FILE_LIMIT + 1, changedLines: 0, manifestChanged: false }), 'medium');
  assert.equal(pickEffort({ files: FILE_LIMIT, changedLines: LINE_LIMIT + 1, manifestChanged: false }), 'medium');
});

test('--effort prints skip for one small edited tracked file', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'app.js'), 'export function greet() { return 1; }\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'skip\n');
});

test('--effort prints low for three new untracked files', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'a.js'), 'const a = 1;\n');
  await fs.writeFile(path.join(root, 'b.js'), 'const b = 1;\n');
  await fs.writeFile(path.join(root, 'c.js'), 'const c = 1;\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'low\n');
});

test('--effort prints low for a lockfile-only change, not skip', async () => {
  const root = await gitRepository({
    'package.json': '{\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n',
    'package-lock.json': '{\n  "lockfileVersion": 3,\n  "packages": {}\n}\n'
  });
  await fs.writeFile(path.join(root, 'package-lock.json'), '{\n  "lockfileVersion": 3,\n  "packages": {\n    "left-pad": {}\n  }\n}\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'low\n');
});

test('--effort prints low for a version-only bump with no dependency added', async () => {
  const root = await gitRepository({ 'package.json': '{\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n' });
  await fs.writeFile(path.join(root, 'package.json'), '{\n  "dependencies": {\n    "left-pad": "1.0.1"\n  }\n}\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'low\n');
});

test('codexOffer holds only when codex is a file on PATH', async () => {
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-path-'));
  assert.equal(codexOffer({ PATH: bin }), false);
  await fs.writeFile(path.join(bin, process.platform === 'win32' ? 'codex.EXE' : 'codex'), '');
  assert.equal(codexOffer({ PATH: bin }), true);
});

test('review-branch reads implementer reports for their Red: lines only', async () => {
  const agent = await fs.readFile(path.join(AGENTS_DIRECTORY, `${light}.md`), 'utf8');
  assert.match(agent, /only for their `Red:` lines/);
  assert.doesNotMatch(agent, /report quotes a passing run/);
});

test('--codex prints offer or none by PATH', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  const result = await run(SCRIPT, ['--codex'], { cwd: root, env: { ...process.env, PATH: path.dirname(process.execPath) } });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^(offer|none)\n$/);
});

test('--effort with --base is rejected', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  const result = await run(SCRIPT, ['--effort', '--base', 'x'], { cwd: root });
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
});
