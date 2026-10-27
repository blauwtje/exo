import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_PATH, readKindTable } from '../lib/model-kinds.mjs';
import { findInheritanceGaps } from '../verify/model-kinds.mjs';

const JOBS = [
  ['review', 'review'], ['verify', 'review'], ['audit', 'review'], ['judge', 'review'],
  ['decide', 'hardest'], ['design', 'hardest'], ['choose', 'hardest'], ['pick', 'hardest'],
  ['cause', 'hardest'], ['diagnose', 'hardest'], ['architect', 'hardest'],
  ['fix', 'build'], ['repair', 'build'], ['implement', 'build'], ['build', 'build'],
  ['investigate', 'investigate'], ['research', 'investigate'], ['summarise', 'investigate'], ['summarize', 'investigate'], ['explore', 'investigate'],
  ['locate', 'lookup'], ['find', 'lookup'], ['lookup', 'lookup'],
  ['rebase', 'chore'], ['squash', 'chore'], ['cleanup', 'chore']
];

function tableWith(edit) {
  const table = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  edit(table);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'model-kinds.json');
  fs.writeFileSync(file, JSON.stringify(table));
  return file;
}

test('unnamed.jobs maps each job word to its kind, review then design then build, investigate, lookup, chore', () => {
  const { jobs } = readKindTable().unnamed;
  assert.deepEqual(Object.entries(jobs), JOBS);
});

test('every job kind is a kind of the table', () => {
  const table = readKindTable();
  for (const kind of Object.values(table.unnamed.jobs)) assert.ok(kind in table.kinds, kind);
});

test('a job word naming an unknown kind is rejected', () => {
  const file = tableWith((table) => { table.unnamed.jobs.fix = 'no-such-kind'; });
  assert.throws(() => readKindTable(file), /unnamed job fix: unknown kind no-such-kind/);
});

function rootWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-root-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test('a hooks text or CLAUDE.md line naming general-purpose or claude with no kind is a gap', () => {
  const root = rootWith({
    'hooks/rules.md': 'ok\nDispatch general-purpose with no kind\nSpawn `claude` here\nDispatch general-purpose, exo-kind: review\nThe general-purpose type inherits the session model.\n',
    '.claude/CLAUDE.md': 'A `claude` delegate\nA general-purpose delegate with exo-kind: build\n'
  });
  assert.deepEqual(findInheritanceGaps(root, { dispatches: [] }), [
    'hooks/rules.md:2: dispatches general-purpose or claude with no exo-kind:',
    'hooks/rules.md:3: dispatches general-purpose or claude with no exo-kind:',
    '.claude/CLAUDE.md:1: dispatches general-purpose or claude with no exo-kind:'
  ]);
});

test('a skills or agents line dispatching a claude agent with no kind is a gap', () => {
  const root = rootWith({
    'skills/x/SKILL.md': 'Dispatch a `claude` agent here\nDispatch a `claude` agent, exo-kind: build\n',
    'agents/y.md': 'Spawn `claude` to check\n'
  });
  assert.deepEqual(findInheritanceGaps(root, { dispatches: [] }), [
    'skills/x/SKILL.md:1: dispatches general-purpose or claude with no exo-kind:',
    'agents/y.md:1: dispatches general-purpose or claude with no exo-kind:'
  ]);
});

test('this repository has no hooks text or CLAUDE.md line dispatching a kindless general-purpose agent', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(findInheritanceGaps(root, readKindTable()).filter((gap) => /^(hooks|\.claude)\//.test(gap)), []);
});
