import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeReviewInput } from '../skills/gate/scripts/review-input.mjs';
import { reviewShardTokens, BYTES_PER_TOKEN } from '../lib/context-limits.mjs';

const ROOT = path.join(import.meta.dirname, '..');

function branchWithChange() {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'user@example.com');
  git('config', 'user.name', 'Jane Doe');
  fs.writeFileSync(path.join(checkout, 'CLAUDE.md'), 'rules\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  fs.writeFileSync(path.join(checkout, 'a.mjs'), 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'add a');
  return checkout;
}

function inputOf(checkout) {
  const frame = { goal: 'ship a', nonGoals: ['no b'], context: ['a lives in a.mjs'] };
  writeReviewInput(frame, { checkout, base: 'HEAD~1', head: 'HEAD', redSection: ['none'] });
  return fs.readFileSync(path.join(checkout, '.exo', 'review-input.md'), 'utf8');
}

test('the input file holds the diff, the review rules, the triage text and the plan excerpt', () => {
  const input = inputOf(branchWithChange());
  assert.match(input, /## Goal\nship a/);
  assert.match(input, /## Non-goals\n- no b/);
  assert.match(input, /## Context\n- a lives in a\.mjs/);
  assert.match(input, /\+export const a = 1;/);
  assert.match(input, /## Review rules\n/);
  assert.ok(input.includes(fs.readFileSync(path.join(ROOT, 'skills/gate/references/review-rules.md'), 'utf8').trim()));
  assert.match(input, /## Triage\n/);
  assert.ok(input.includes(fs.readFileSync(path.join(ROOT, 'skills/gate/references/triage.md'), 'utf8').trim()));
});

test('the input file lists the nearest instruction files that exist', () => {
  const input = inputOf(branchWithChange());
  assert.match(input, /## Instruction files\n- .*CLAUDE\.md\n/);
  assert.ok(!input.includes('AGENTS.md'));
});

test('a small branch input stays under the shard budget', () => {
  const input = inputOf(branchWithChange());
  assert.ok(Buffer.byteLength(input) <= reviewShardTokens() * BYTES_PER_TOKEN);
});

test('the reviewer agent names its allowed reads in one line', () => {
  const agent = fs.readFileSync(path.join(ROOT, 'agents/review-branch.md'), 'utf8');
  const lines = agent.split('\n').filter((line) => line.startsWith('- Read only '));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /input file/);
  assert.match(lines[0], /finding/);
});
