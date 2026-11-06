import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { frameOf } from '#plan-frame';
import { taskBrief } from '../skills/build/scripts/next-task-brief.mjs';
import { fixture, run } from './harness.mjs';

const MEMORY = fileURLToPath(new URL('../skills/remember/scripts/memory.mjs', import.meta.url));

const line = (claim, refs, written = '2026-10-01') => ({ claim, refs, written, superseded: null, dropped: null, retired: null, quotes: [] });

async function repositoryWith(lines) {
  const repository = await fixture();
  execFileSync('git', ['init', '-q', repository]);
  fs.mkdirSync(path.join(repository, '.git', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(repository, '.git', 'exo', 'memory.json'), JSON.stringify({ candidates: {}, lines, rejected: {} }));
  return repository;
}

async function briefFor(repository, files) {
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = await fixture();
  try {
    return taskBrief(task(files), frameOf({ Goal: 'G' }), repository);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
}

const task = (files) => ({ number: 1, title: 'T', design: false, proof: null, runs: [], files: files.map((file) => ({ path: file, kind: 'Modify', region: null })), section: '### Task 1: T' });

const LESSONS = [
  line('Quote shell values in single quotes.', ['skills/build/scripts/*.mjs']),
  line('Keep billing totals in cents.', ['src/billing/**']),
  line('Never mock the database in tests.', ['**'])
];

test('a brief carries only the lessons whose globs match the task files', async () => {
  const repository = await repositoryWith(LESSONS);
  const brief = await briefFor(repository, ['src/billing/total.js']);
  assert.match(brief, /Lessons for these paths:/);
  assert.match(brief, /Keep billing totals in cents\./);
  assert.match(brief, /Never mock the database/);
  assert.doesNotMatch(brief, /Quote shell values/);
});

test('a brief for files no glob matches carries no lesson block', async () => {
  const repository = await repositoryWith(LESSONS.slice(0, 2));
  const brief = await briefFor(repository, ['docs/readme.md']);
  assert.doesNotMatch(brief, /Lessons for these paths/);
});

test('the lessons command lists the same matches for gate and spec', async () => {
  const repository = await repositoryWith(LESSONS);
  const result = await run(MEMORY, ['lessons', '--files', 'skills/build/scripts/run.mjs', '--cwd', repository]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Quote shell values/);
  assert.doesNotMatch(result.stdout, /billing/);
});

test('verify drops a lesson whose glob matches no tracked file', async () => {
  const repository = await repositoryWith([line('Old rule.', ['gone/**/*.js']), line('Live rule.', ['src/**'])]);
  fs.mkdirSync(path.join(repository, 'src'));
  fs.writeFileSync(path.join(repository, 'src', 'a.js'), '');
  execFileSync('git', ['-C', repository, 'add', '.']);
  const result = await run(MEMORY, ['verify', '--cwd', repository]);
  assert.match(result.stdout, /dropped "Old rule\."/);
  assert.doesNotMatch(result.stdout, /dropped "Live rule\."/);
});

test('claude-md proposes a repository-wide lesson and writes no CLAUDE.md', async () => {
  const repository = await repositoryWith(LESSONS);
  const result = await run(MEMORY, ['claude-md', '--cwd', repository]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Proposed CLAUDE\.md line \(nothing written\): Never mock the database/);
  assert.doesNotMatch(result.stdout, /billing/);
  assert.equal(fs.existsSync(path.join(repository, 'CLAUDE.md')), false);
  assert.equal(fs.existsSync(path.join(repository, 'AGENTS.md')), false);
});
