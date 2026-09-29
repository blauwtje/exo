// The writer applies the kind table to agent files, skill frontmatter and
// dispatch lines; the drift list is empty exactly when every member matches.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findKindDrift, writeKinds } from '../verify/model-kinds.mjs';

const TABLE = {
  provider: 'claude',
  providers: { claude: { tiers: { strong: 'opus', standard: 'sonnet', fast: 'haiku' } } },
  kinds: {
    build: { model: 'sonnet', effort: 'high' },
    hardest: { model: 'opus', effort: 'max' },
    review: { model: 'sonnet', effort: 'high' },
    'review-deep': { model: 'opus', effort: 'max' },
    lookup: { model: 'haiku', effort: null }
  },
  agents: {
    'agents/worker.md': { kind: 'build' },
    'agents/finder.md': { kind: 'lookup' },
    'agents/reviewer.md': { kind: 'review' },
    'agents/reviewer-deep.md': { kind: 'review-deep', generatedFrom: 'agents/reviewer.md' }
  },
  skills: {
    'skills/alpha/SKILL.md': { kind: 'build', fields: ['effort'] },
    'skills/beta/SKILL.md': { kind: 'hardest', fields: ['model', 'effort'] }
  },
  dispatches: [
    { file: 'skills/alpha/SKILL.md', match: 'delegate on `opus` for a fix', kind: 'hardest' },
    { file: 'skills/alpha/SKILL.md', match: 'then `sonnet` for the rest', kind: 'build' }
  ]
};

const FILES = {
  'agents/worker.md': '---\nname: worker\nmodel: opus\neffort: low\ntools: Read\n---\n\nBody of worker.\n',
  'agents/finder.md': '---\nname: finder\nmodel: sonnet\neffort: high\ntools: Read\n---\n\nBody of finder.\n',
  'agents/reviewer.md': '---\nname: reviewer\nmodel: sonnet\ntools: Read\n---\n\nBody of reviewer.\n',
  'skills/alpha/SKILL.md': '---\nname: alpha\neffort: low\n---\n\nRun it: delegate on `sonnet` for a fix, then `opus` for the rest.\n',
  'skills/beta/SKILL.md': '---\nname: beta\nmodel: haiku\n---\n\nBeta.\n'
};

function makeRoot(files = FILES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-writer-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

function read(root, file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('the drift list names each file, field, expected and actual value', () => {
  const drift = findKindDrift(makeRoot(), TABLE);
  assert.deepEqual(drift.filter((record) => record.file.startsWith('agents/')), [
    { file: 'agents/worker.md', field: 'model', expected: 'sonnet', actual: 'opus' },
    { file: 'agents/worker.md', field: 'effort', expected: 'high', actual: 'low' },
    { file: 'agents/finder.md', field: 'model', expected: 'haiku', actual: 'sonnet' },
    { file: 'agents/finder.md', field: 'effort', expected: null, actual: 'high' },
    { file: 'agents/reviewer.md', field: 'effort', expected: 'high', actual: null },
    { file: 'agents/reviewer-deep.md', field: 'name', expected: 'reviewer-deep', actual: null },
    { file: 'agents/reviewer-deep.md', field: 'model', expected: 'opus', actual: null },
    { file: 'agents/reviewer-deep.md', field: 'effort', expected: 'max', actual: null }
  ]);
  assert.deepEqual(drift.filter((record) => record.file.startsWith('skills/')), [
    { file: 'skills/alpha/SKILL.md', field: 'effort', expected: 'high', actual: 'low' },
    { file: 'skills/alpha/SKILL.md', field: 'model', expected: 'opus', actual: 'sonnet' },
    { file: 'skills/alpha/SKILL.md', field: 'model', expected: 'sonnet', actual: 'opus' },
    { file: 'skills/beta/SKILL.md', field: 'model', expected: 'opus', actual: 'haiku' },
    { file: 'skills/beta/SKILL.md', field: 'effort', expected: 'max', actual: null }
  ]);
});

test('writing applies the table and leaves nothing to drift', () => {
  const root = makeRoot();
  writeKinds(root, TABLE);
  assert.deepEqual(findKindDrift(root, TABLE), []);
  assert.equal(read(root, 'agents/worker.md'), '---\nname: worker\nmodel: sonnet\neffort: high\ntools: Read\n---\n\nBody of worker.\n');
  assert.equal(read(root, 'agents/finder.md'), '---\nname: finder\nmodel: haiku\ntools: Read\n---\n\nBody of finder.\n');
  assert.equal(read(root, 'agents/reviewer.md'), '---\nname: reviewer\nmodel: sonnet\neffort: high\ntools: Read\n---\n\nBody of reviewer.\n');
  assert.equal(read(root, 'agents/reviewer-deep.md'), '---\nname: reviewer-deep\nmodel: opus\neffort: max\ntools: Read\n---\n\nBody of reviewer.\n');
  assert.equal(
    read(root, 'skills/alpha/SKILL.md'),
    '---\nname: alpha\neffort: high\n---\n\nRun it: delegate on `opus` for a fix, then `sonnet` for the rest.\n'
  );
  assert.equal(read(root, 'skills/beta/SKILL.md'), '---\nname: beta\nmodel: opus\neffort: max\n---\n\nBeta.\n');
});

test('a second write changes no file', () => {
  const root = makeRoot();
  writeKinds(root, TABLE);
  const before = Object.keys(TABLE.agents).map((file) => fs.statSync(path.join(root, file)).mtimeMs);
  const snapshot = Object.keys(FILES).map((file) => read(root, file));
  writeKinds(root, TABLE);
  assert.deepEqual(Object.keys(FILES).map((file) => read(root, file)), snapshot);
  assert.deepEqual(Object.keys(TABLE.agents).map((file) => fs.statSync(path.join(root, file)).mtimeMs), before);
});

test('a twin whose body differs from its source is drift the writer repairs', () => {
  const root = makeRoot();
  writeKinds(root, TABLE);
  fs.appendFileSync(path.join(root, 'agents/reviewer-deep.md'), 'An extra line.\n');
  const drift = findKindDrift(root, TABLE);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].file, 'agents/reviewer-deep.md');
  assert.equal(drift[0].field, 'body');
  writeKinds(root, TABLE);
  assert.deepEqual(findKindDrift(root, TABLE), []);
});

test('a dispatch match that finds no line, or two, fails loudly', () => {
  const root = makeRoot();
  const missing = structuredClone(TABLE);
  missing.dispatches[0].match = 'delegate on `opus` for nothing';
  assert.throws(() => findKindDrift(root, missing), /skills\/alpha\/SKILL\.md.*matches 0 lines/);
  const twice = structuredClone(TABLE);
  twice.dispatches[0].match = 'delegate on `opus`';
  fs.appendFileSync(path.join(root, 'skills/alpha/SKILL.md'), 'Also delegate on `haiku` here.\n');
  assert.throws(() => findKindDrift(root, twice), /matches 2 lines/);
});

test('a dispatch line holding the model word of another provider block is found and rewritten', () => {
  const table = structuredClone(TABLE);
  table.providers.codex = { tiers: { strong: 'gpt-5', standard: 'gpt-5-mini', fast: 'gpt-5-nano' } };
  const alpha = '---\nname: alpha\neffort: high\n---\n\nRun it: delegate on `gpt-5` for a fix, then `sonnet` for the rest.\n';
  const root = makeRoot({ ...FILES, 'skills/alpha/SKILL.md': alpha });
  writeKinds(root, table);
  assert.match(read(root, 'skills/alpha/SKILL.md'), /delegate on `opus` for a fix, then `sonnet` for the rest/);
});

test('an entry description is written into its file, and a hand edit of it is drift', () => {
  const table = structuredClone(TABLE);
  table.agents['agents/reviewer-deep.md'].description = 'Reviews a large branch.';
  const source = '---\nname: reviewer\ndescription: "Reviews a small branch."\nmodel: sonnet\neffort: high\n---\n\nBody of reviewer.\n';
  const root = makeRoot({ ...FILES, 'agents/reviewer.md': source });
  writeKinds(root, table);
  assert.match(read(root, 'agents/reviewer-deep.md'), /^---\nname: reviewer-deep\ndescription: "Reviews a large branch\."\nmodel: opus\n/);
  assert.match(read(root, 'agents/reviewer.md'), /description: "Reviews a small branch\."/);
  assert.deepEqual(findKindDrift(root, table), []);
  const twin = path.join(root, 'agents/reviewer-deep.md');
  fs.writeFileSync(twin, read(root, 'agents/reviewer-deep.md').replace('a large branch', 'anything'));
  const [record] = findKindDrift(root, table);
  assert.deepEqual(record, { file: 'agents/reviewer-deep.md', field: 'description', expected: '"Reviews a large branch."', actual: '"Reviews anything."' });
});

test('a kind on inherit and xhigh is written into an agent file as those values', () => {
  const table = structuredClone(TABLE);
  table.kinds.review = { model: 'inherit', effort: 'xhigh' };
  const root = makeRoot();
  writeKinds(root, table);
  assert.match(read(root, 'agents/reviewer.md'), /^---\nname: reviewer\nmodel: inherit\neffort: xhigh\n/);
  assert.deepEqual(findKindDrift(root, table), []);
});
