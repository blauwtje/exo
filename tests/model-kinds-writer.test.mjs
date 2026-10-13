import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findInheritanceGaps, findKindDrift } from '../verify/model-kinds.mjs';

const TABLE = {
  dispatches: [
    { file: 'skills/alpha/SKILL.md', match: 'a `general-purpose` delegate whose prompt opens with `exo-kind: build`', kind: 'build' }
  ]
};

const FILES = {
  'agents/worker.md': '---\nname: worker\ntools: Read\n---\n\nBody of worker.\n',
  'agents/finder.md': '---\nname: finder\ntools: Read\n---\n\nBody of finder.\n',
  'skills/alpha/SKILL.md': '---\nname: alpha\n---\n\nSend a `general-purpose` delegate whose prompt opens with `exo-kind: build`.\n',
  'skills/beta/SKILL.md': '---\nname: beta\n---\n\nBeta.\n'
};

function makeRoot(files = FILES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-writer-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test('files with no model or effort line and a kind on every dispatch have no drift', () => {
  assert.deepEqual(findKindDrift(makeRoot(), TABLE), []);
});

test('a model or effort line in an agent or skill frontmatter is flagged', () => {
  const root = makeRoot({
    ...FILES,
    'agents/worker.md': '---\nname: worker\nmodel: opus\neffort: low\ntools: Read\n---\n\nBody.\n',
    'skills/beta/SKILL.md': '---\nname: beta\nmodel: haiku\n---\n\nBeta.\n'
  });
  assert.deepEqual(findKindDrift(root, TABLE), [
    { file: 'agents/worker.md', field: 'model', expected: null, actual: 'opus' },
    { file: 'agents/worker.md', field: 'effort', expected: null, actual: 'low' },
    { file: 'skills/beta/SKILL.md', field: 'model', expected: null, actual: 'haiku' }
  ]);
});

test('a dispatches line that does not say its prompt opens with its kind is flagged', () => {
  const table = structuredClone(TABLE);
  table.dispatches[0].match = 'a `general-purpose` delegate whose prompt opens with';
  assert.deepEqual(findKindDrift(makeRoot(), table), [
    { file: 'skills/alpha/SKILL.md', field: 'dispatch', expected: 'exo-kind: build', actual: table.dispatches[0].match }
  ]);
  table.dispatches[0].match = 'prompt opens with `exo-kind: lookup`';
  const root = makeRoot({ ...FILES, 'skills/alpha/SKILL.md': '---\nname: alpha\n---\n\nIts prompt opens with `exo-kind: lookup`.\n' });
  assert.equal(findKindDrift(root, table).length, 1);
});

test('a dispatch match that finds no line, or two, fails loudly', () => {
  const root = makeRoot();
  const missing = structuredClone(TABLE);
  missing.dispatches[0].match = 'delegate for nothing';
  assert.throws(() => findKindDrift(root, missing), /skills\/alpha\/SKILL\.md.*matches 0 lines/);
  const twice = structuredClone(TABLE);
  fs.appendFileSync(path.join(root, 'skills/alpha/SKILL.md'), 'Again: a `general-purpose` delegate whose prompt opens with `exo-kind: build`.\n');
  assert.throws(() => findKindDrift(root, twice), /matches 2 lines/);
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

test('the inheritance scan names an uncovered general-purpose line, the session\'s model and a fork', () => {
  const alpha = [
    '---', 'name: alpha', '---', '',
    'Send a `general-purpose` delegate whose prompt opens with `exo-kind: build`.',
    'Send a `general-purpose` agent.',
    'Hand over on the session\'s model.',
    'Dispatch a fork of this session.',
    'Fork the dark scheme in one place.', ''
  ].join('\n');
  const root = makeRoot({ 'skills/alpha/SKILL.md': alpha });
  assert.deepEqual(findInheritanceGaps(root, TABLE), [
    'skills/alpha/SKILL.md:6: names general-purpose with no dispatches entry in lib/model-kinds.json',
    'skills/alpha/SKILL.md:7: names "the session\'s model"; name a kind in the prompt',
    'skills/alpha/SKILL.md:8: dispatches a fork, which takes the session\'s effort (the session effort would reach the subagent)'
  ]);
});
