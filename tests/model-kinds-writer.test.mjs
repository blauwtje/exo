// The writer applies the kind table to agent files, skill frontmatter and
// dispatch lines; the drift list is empty exactly when every member matches.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findInheritanceGaps, findKindDrift, writeKinds } from '../verify/model-kinds.mjs';

const TABLE = {
  provider: 'claude',
  providers: { claude: { tiers: { strong: 'opus', standard: 'sonnet', fast: 'haiku' } } },
  kinds: {
    build: { model: 'sonnet', effort: 'high' },
    hardest: { model: 'opus', effort: 'max' },
    review: { model: 'sonnet', effort: 'high' },
    'review-deep': { model: 'opus', effort: 'max' },
    lookup: { model: 'haiku', effort: null },
    peer: { model: 'inherit', effort: 'high' }
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
    { file: 'agents/reviewer-deep.md', field: 'name', expected: 'reviewer-deep', actual: null }
  ]);
  assert.deepEqual(drift.filter((record) => record.file.startsWith('skills/')), [
    { file: 'skills/alpha/SKILL.md', field: 'effort', expected: 'high', actual: 'low' },
    { file: 'skills/alpha/SKILL.md', field: 'model', expected: 'opus', actual: 'sonnet' },
    { file: 'skills/alpha/SKILL.md', field: 'effort', expected: 'max', actual: null },
    { file: 'skills/alpha/SKILL.md', field: 'model', expected: 'sonnet', actual: 'opus' },
    { file: 'skills/beta/SKILL.md', field: 'model', expected: 'opus', actual: 'haiku' }
  ]);
});

test('writing applies the table and leaves nothing to drift', () => {
  const root = makeRoot();
  writeKinds(root, TABLE);
  assert.deepEqual(findKindDrift(root, TABLE), []);
  assert.equal(read(root, 'agents/worker.md'), '---\nname: worker\nmodel: sonnet\neffort: high\ntools: Read\n---\n\nBody of worker.\n');
  assert.equal(read(root, 'agents/finder.md'), '---\nname: finder\nmodel: haiku\ntools: Read\n---\n\nBody of finder.\n');
  assert.equal(read(root, 'agents/reviewer.md'), FILES['agents/reviewer.md']);
  assert.equal(read(root, 'agents/reviewer-deep.md'), '---\nname: reviewer-deep\nmodel: opus\ntools: Read\n---\n\nBody of reviewer.\n');
  assert.equal(
    read(root, 'skills/alpha/SKILL.md'),
    '---\nname: alpha\neffort: high\n---\n\nRun it: delegate on `opus` at `max` effort for a fix, then `sonnet` for the rest.\n'
  );
  assert.equal(read(root, 'skills/beta/SKILL.md'), '---\nname: beta\nmodel: opus\n---\n\nBeta.\n');
});

test('an agent or table skill with no model or effort line passes, and the writer adds none', () => {
  const files = {
    'agents/worker.md': '---\nname: worker\ntools: Read\n---\n\nBody of worker.\n',
    'skills/alpha/SKILL.md': '---\nname: alpha\n---\n\nRun it: delegate on `opus` at `max` effort for a fix, then `sonnet` for the rest.\n',
    'skills/beta/SKILL.md': '---\nname: beta\n---\n\nBeta.\n'
  };
  const table = structuredClone(TABLE);
  table.agents = { 'agents/worker.md': { kind: 'build' } };
  const root = makeRoot(files);
  assert.deepEqual(findKindDrift(root, table), []);
  writeKinds(root, table);
  for (const [file, text] of Object.entries(files)) assert.equal(read(root, file), text);
});

test('a pinned line is still held to the table', () => {
  const table = structuredClone(TABLE);
  table.agents = { 'agents/worker.md': { kind: 'build' } };
  const root = makeRoot({ ...FILES, 'agents/worker.md': '---\nname: worker\nmodel: opus\n---\n\nBody.\n' });
  const drift = findKindDrift(root, table).filter((record) => record.file === 'agents/worker.md');
  assert.deepEqual(drift, [{ file: 'agents/worker.md', field: 'model', expected: 'sonnet', actual: 'opus' }]);
});

test('a dispatches line saying the prompt opens with its kind passes, and one for another kind is not found', () => {
  const table = structuredClone(TABLE);
  table.skills = {};
  table.agents = {};
  table.dispatches = [{ file: 'skills/beta/SKILL.md', match: 'a `general-purpose` delegate whose prompt opens with `exo-kind: build`', kind: 'build' }];
  const beta = '---\nname: beta\n---\n\nSend a `general-purpose` delegate whose prompt opens with `exo-kind: build`.\n';
  const root = makeRoot({ ...FILES, 'skills/beta/SKILL.md': beta });
  assert.deepEqual(findKindDrift(root, table), []);
  writeKinds(root, table);
  assert.equal(read(root, 'skills/beta/SKILL.md'), beta);
  assert.deepEqual(findInheritanceGaps(root, table).filter((gap) => gap.includes('skills/')), []);
  table.dispatches[0].kind = 'lookup';
  assert.throws(() => findKindDrift(root, table), /holds no model word/);
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
  assert.match(read(root, 'skills/alpha/SKILL.md'), /delegate on `opus` at `max` effort for a fix, then `sonnet` for the rest/);
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
  const pinned = '---\nname: reviewer\nmodel: sonnet\neffort: high\ntools: Read\n---\n\nBody of reviewer.\n';
  const root = makeRoot({ ...FILES, 'agents/reviewer.md': pinned });
  writeKinds(root, table);
  assert.match(read(root, 'agents/reviewer.md'), /^---\nname: reviewer\nmodel: inherit\neffort: xhigh\n/);
  assert.deepEqual(findKindDrift(root, table), []);
});

test('a dispatch on a kind resolving to inherit reads with `model` omitted, and a kind moving off it reads on its model again', () => {
  const table = structuredClone(TABLE);
  table.kinds.handover = { model: 'inherit', effort: null };
  table.dispatches.push({ file: 'skills/beta/SKILL.md', match: 'hand over on `opus` to a delegate', kind: 'handover' });
  const beta = '---\nname: beta\nmodel: haiku\n---\n\nThen hand over on `opus` to a delegate.\n';
  const root = makeRoot({ ...FILES, 'skills/beta/SKILL.md': beta });
  writeKinds(root, table);
  assert.match(read(root, 'skills/beta/SKILL.md'), /Then hand over with `model` omitted to a delegate\./);
  assert.deepEqual(findKindDrift(root, table), []);
  table.kinds.handover = { model: 'sonnet', effort: null };
  const [record] = findKindDrift(root, table);
  assert.deepEqual(record, { file: 'skills/beta/SKILL.md', field: 'model', expected: 'sonnet', actual: 'inherit' });
  writeKinds(root, table);
  assert.match(read(root, 'skills/beta/SKILL.md'), /Then hand over on `sonnet` to a delegate\./);
});

test('a dispatch line with no on clause fails loudly when its kind resolves to inherit', () => {
  const table = structuredClone(TABLE);
  table.kinds.build = { model: 'inherit', effort: 'high' };
  assert.throws(() => findKindDrift(makeRoot(), table), /then `sonnet` for the rest.*cannot omit `model`/);
});

test('a dispatch on a model the provider lists but no tier maps is written and found again', () => {
  const table = structuredClone(TABLE);
  table.providers.claude.models = ['fable', 'opus', 'sonnet', 'haiku'];
  table.kinds.hardest = { model: 'fable', effort: 'max' };
  const root = makeRoot();
  writeKinds(root, table);
  assert.match(read(root, 'skills/alpha/SKILL.md'), /delegate on `fable` at `max` effort for a fix/);
  assert.deepEqual(findKindDrift(root, table), []);
});

test('node verify/model-kinds.mjs runs when the path to it passes through a symlinked folder', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'model-kinds-link-')));
  try {
    const link = path.join(base, 'linked-clone');
    fs.symlinkSync(fileURLToPath(new URL('../', import.meta.url)), link, 'dir');
    const done = spawnSync(process.execPath, [path.join(link, 'verify', 'model-kinds.mjs'), '--bogus'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(done.status, 1);
    assert.match(done.stderr, /Unknown option '--bogus'/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a dispatch states its kind\'s effort after the model, and a wrong or missing one is drift the writer sets', () => {
  const table = structuredClone(TABLE);
  table.dispatches = [{ file: 'skills/beta/SKILL.md', match: 'send it on `opus` at `low` effort now', kind: 'review' }];
  const beta = '---\nname: beta\nmodel: haiku\n---\n\nThen send it on `opus` at `low` effort now.\n';
  const root = makeRoot({ ...FILES, 'skills/beta/SKILL.md': beta });
  table.skills = {};
  assert.deepEqual(findKindDrift(root, table).filter((record) => record.file === 'skills/beta/SKILL.md').map((record) => [record.field, record.expected, record.actual]), [['model', 'sonnet', 'opus'], ['effort', 'high', 'low']]);
  writeKinds(root, table);
  assert.match(read(root, 'skills/beta/SKILL.md'), /Then send it on `sonnet` at `high` effort now\./);
  assert.deepEqual(findKindDrift(root, table), []);
});

test('an inherit dispatch reads "with `model` omitted at `<effort>` effort"', () => {
  const table = structuredClone(TABLE);
  table.dispatches = [{ file: 'skills/beta/SKILL.md', match: 'send it on `opus` now', kind: 'peer' }];
  const beta = '---\nname: beta\nmodel: haiku\n---\n\nThen send it on `opus` now.\n';
  const root = makeRoot({ ...FILES, 'skills/beta/SKILL.md': beta });
  writeKinds(root, table);
  assert.match(read(root, 'skills/beta/SKILL.md'), /Then send it with `model` omitted at `high` effort now\./);
  assert.deepEqual(findInheritanceGaps(root, table).filter((gap) => gap.includes('skills/')), []);
});

test('the inheritance scan names an agent without effort, an uncovered general-purpose line, the session\'s model and a fork', () => {
  const table = structuredClone(TABLE);
  table.agents = { 'agents/finder.md': { kind: 'lookup' }, 'agents/worker.md': { kind: 'build' } };
  table.dispatches = [{ file: 'skills/alpha/SKILL.md', match: 'a `general-purpose` delegate on `sonnet` at `high` effort', kind: 'build' }];
  const alpha = [
    '---', 'name: alpha', '---', '',
    'Send a `general-purpose` delegate on `sonnet` at `high` effort.',
    'Send a `general-purpose` agent.',
    'Hand over on the session\'s model.',
    'Dispatch a fork of this session.',
    'Fork the dark scheme in one place.', ''
  ].join('\n');
  const root = makeRoot({
    'agents/finder.md': FILES['agents/finder.md'],
    'agents/worker.md': '---\nname: worker\nmodel: sonnet\neffort: high\n---\n\nBody.\n',
    'agents/stray.md': '---\nname: stray\nmodel: sonnet\n---\n\nBody.\n',
    'skills/alpha/SKILL.md': alpha
  });
  assert.deepEqual(findInheritanceGaps(root, table), [
    'agents/stray.md: no effort: line, the session effort would reach the subagent',
    'agents/finder.md: kind lookup has no effort, the session effort would reach the subagent',
    'skills/alpha/SKILL.md:6: names general-purpose with no dispatches entry in lib/model-kinds.json',
    'skills/alpha/SKILL.md:7: names "the session\'s model"; pin a kind with model and effort',
    'skills/alpha/SKILL.md:8: dispatches a fork, which takes the session\'s effort'
  ]);
});

test('a dispatches entry with a bare model word or a kind with no effort is a gap', () => {
  const table = structuredClone(TABLE);
  table.agents = {};
  table.dispatches = [
    { file: 'skills/alpha/SKILL.md', match: 'a `general-purpose` delegate on `sonnet` at `high` effort', kind: 'build' },
    { file: 'skills/alpha/SKILL.md', match: 'a `general-purpose` agent with `sonnet` here', kind: 'build' },
    { file: 'skills/alpha/SKILL.md', match: 'a `general-purpose` helper on `haiku` now', kind: 'lookup' }
  ];
  const alpha = [
    '---', 'name: alpha', '---', '',
    'Send a `general-purpose` delegate on `sonnet` at `high` effort.',
    'Send a `general-purpose` agent with `sonnet` here.',
    'Send a `general-purpose` helper on `haiku` now.', ''
  ].join('\n');
  const root = makeRoot({ 'skills/alpha/SKILL.md': alpha });
  const gaps = findInheritanceGaps(root, table);
  assert.equal(gaps.length, 2);
  assert.match(gaps[0], /"a `general-purpose` agent with `sonnet` here" names a bare model/);
  assert.match(gaps[1], /kind lookup with no effort/);
});
