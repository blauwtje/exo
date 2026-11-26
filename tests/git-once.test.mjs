import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkGitOnce } from '../verify/checks/git-once.mjs';
import { createRepository } from '../verify/repository.mjs';

function fixture(runs, baseline) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'git-once-test-'));
  const traceRoot = path.join(base, 'traces');
  fs.mkdirSync(traceRoot);
  const root = path.join(base, 'repo');
  fs.mkdirSync(path.join(root, 'verify', 'checks'), { recursive: true });
  if (baseline) fs.writeFileSync(path.join(root, 'verify', 'checks', 'git-once-baseline.json'), JSON.stringify(baseline));
  let second = 0;
  for (const [folder, commands] of Object.entries(runs)) {
    fs.mkdirSync(path.join(traceRoot, folder));
    commands.forEach((argv, index) => {
      const time = `2025-01-01T00:00:${String(second++).padStart(2, '0')}.000000Z`;
      const line = JSON.stringify({ event: 'start', sid: `p-${second}`, time, argv: ['git', ...argv] });
      fs.writeFileSync(path.join(traceRoot, folder, String(index)), `${line}\n`);
    });
  }
  return { root, traceRoot };
}

function resultOf({ root, traceRoot }) {
  const results = [];
  checkGitOnce({ result: (status, name, detail) => results.push({ status, detail }), assert(ok, name, d) { this.result(ok ? 'PASS' : 'FAIL', name, ok ? d.pass : d.fail); } }, createRepository(root), traceRoot);
  return results[0];
}

const STATUS = ['-C', '/work/repo', 'status', '--short'];

test('FAIL when the same git read starts twice with no write between', () => {
  const answer = resultOf(fixture({ 'land-task.mjs-abc123': [STATUS, ['log'], STATUS] }));
  assert.equal(answer.status, 'FAIL');
  assert.equal(answer.detail, 'land-task.mjs runs "git status --short" 2 times with no git write between');
});

test('PASS when a git write sits between the two reads', () => {
  const answer = resultOf(fixture({ 'land-task.mjs-abc123': [STATUS, ['-C', '/work/repo', 'commit', '-m', 'x'], STATUS] }));
  assert.equal(answer.status, 'PASS');
});

test('PASS for a duplicate whose normalized key is baselined, FAIL above its count', () => {
  const key = 'land-task.mjs: git rev-parse <sha> <tmp>';
  const read = (sha) => ['rev-parse', sha, path.join(os.tmpdir(), 'x')];
  const baseline = { [key]: { count: 2, reason: 'outside the plan files' } };
  const twice = fixture({ 'land-task.mjs-abc123': [read('abcdef1'), read('abcdef2')] }, baseline);
  assert.equal(resultOf(twice).status, 'PASS');
  const thrice = fixture({ 'land-task.mjs-abc123': [read('abcdef1'), read('abcdef2'), read('abcdef3')] }, baseline);
  assert.equal(resultOf(thrice).status, 'FAIL');
});

test('UNRUN without a trace root', () => {
  const { root } = fixture({});
  assert.equal(resultOf({ root, traceRoot: undefined }).status, 'UNRUN');
});

test('FAIL when the baseline grows past the merge base with origin/main', () => {
  const { root, traceRoot } = fixture({}, { 'a.mjs: git log': { count: 1, reason: 'r' } });
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args]);
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  fs.writeFileSync(path.join(root, 'verify', 'checks', 'git-once-baseline.json'), JSON.stringify({ 'a.mjs: git log': { count: 2, reason: 'r' } }));
  const answer = resultOf({ root, traceRoot });
  assert.equal(answer.status, 'FAIL');
  assert.match(answer.detail, /raises "a\.mjs: git log" to 2/);
});

test('a static verify run reports no UNRUN', () => {
  const output = execFileSync('node', [path.join(import.meta.dirname, '..', 'verify.mjs'), '--static'], { encoding: 'utf8' });
  assert.match(output, /UNRUN=0\b/);
});
