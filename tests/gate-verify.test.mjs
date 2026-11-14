import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VERIFY = path.join(import.meta.dirname, '..', 'skills', 'gate', 'scripts', 'verify.mjs');

function planWith(proofs, criterion) {
  const tasks = proofs.map((proof, index) => `### Task ${index + 1}: t${index + 1}\n\nDepends on: none | Files: \`a.txt\` | Data: x | Proof: ${proof}\n`);
  return `# Plan\n\n## Success criterion\n\n\`${criterion}\`\n\n## Tasks\n\n${tasks.join('\n')}`;
}

function runVerify(args, plan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-gate-verify-'));
  const planPath = path.join(dir, 'plan.md');
  if (plan !== undefined) fs.writeFileSync(planPath, plan);
  const run = spawnSync(process.execPath, [VERIFY, '--plan', planPath, '--root', dir, ...args], { encoding: 'utf8', timeout: 50000 });
  return { dir, status: run.status, lines: run.stdout.trim().split('\n') };
}

test('all green prints only PASS lines', () => {
  const { status, lines } = runVerify([], planWith(['true', 'true'], 'true'));
  assert.equal(status, 0);
  assert.deepEqual(lines, ['PASS Task 1', 'PASS Task 2', 'PASS criterion']);
});

test('a failing proof prints FAIL and keeps its output in the log', () => {
  const { dir, status, lines } = runVerify([], planWith(['true', 'echo boom; false'], 'true'));
  assert.equal(status, 1);
  assert.deepEqual(lines, ['PASS Task 1', 'FAIL Task 2 (output in .exo/logs/gate-verify.log)', 'PASS criterion']);
  assert.match(fs.readFileSync(path.join(dir, '.exo', 'logs', 'gate-verify.log'), 'utf8'), /FAIL Task 2\nboom/);
});

test('a failing criterion alone prints FAIL', () => {
  const { status, lines } = runVerify([], planWith(['true'], 'false'));
  assert.equal(status, 1);
  assert.deepEqual(lines, ['PASS Task 1', 'FAIL criterion (output in .exo/logs/gate-verify.log)']);
});

test('no plan file prints FAIL no-plan', () => {
  const { status, lines } = runVerify([], undefined);
  assert.equal(status, 1);
  assert.deepEqual(lines, ['FAIL no-plan']);
});

test('a plan path relative to --root is found from another cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-gate-verify-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), planWith(['true'], 'true'));
  const run = spawnSync(process.execPath, [VERIFY, '--plan', 'plan.md', '--root', dir], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 50000 });
  assert.equal(run.status, 0);
  assert.deepEqual(run.stdout.trim().split('\n'), ['PASS Task 1', 'PASS criterion']);
});
