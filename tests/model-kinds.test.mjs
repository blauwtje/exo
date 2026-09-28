// The kind table names real files, and what it says about a skill's
// frontmatter and a prompt-file dispatch is what those files hold today.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readKindTable } from '#model-kinds';

const ROOT = new URL('../', import.meta.url).pathname;
const MODEL_WORD = /`(opus|sonnet|haiku)`/g;

const table = readKindTable();

function readRepoFile(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function frontmatterField(file, field) {
  const frontmatter = readRepoFile(file).split('---')[1];
  const line = frontmatter.split('\n').find((row) => row.startsWith(`${field}:`));
  return line ? line.slice(field.length + 1).trim() : null;
}

function readTableWith(change) {
  const copy = structuredClone(table);
  change(copy);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'table.json');
  fs.writeFileSync(file, JSON.stringify(copy));
  return () => readKindTable(file);
}

test('every kind holds a known model and an effort or null', () => {
  assert.deepEqual(Object.keys(table.kinds).sort(), [
    'build', 'chore', 'coordinate', 'hardest', 'investigate',
    'lookup', 'prose', 'research', 'review', 'review-deep'
  ]);
  assert.deepEqual(table.kinds.hardest, { model: 'opus', effort: 'max' });
  assert.deepEqual(table.kinds.build, { model: 'sonnet', effort: 'high' });
  assert.equal(table.kinds.lookup.effort, null);
});

test('the reader rejects an unknown model, effort, kind or skill field', () => {
  assert.throws(readTableWith((copy) => { copy.kinds.build.model = 'gpt'; }), /kind build: unknown model gpt/);
  assert.throws(readTableWith((copy) => { copy.kinds.build.effort = 'huge'; }), /kind build: unknown effort huge/);
  assert.throws(readTableWith((copy) => { copy.agents['agents/build-ui.md'].kind = 'nope'; }), /agents\/build-ui\.md: unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.dispatches[0].kind = 'nope'; }), /unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.skills['skills/verify/SKILL.md'].fields = ['tools']; }), /unknown field tools/);
});

test('every agent file has exactly one entry, and each entry names a file or its source', () => {
  const agentFiles = fs.readdirSync(path.join(ROOT, 'agents')).map((name) => `agents/${name}`);
  for (const file of agentFiles) {
    assert.ok(file in table.agents, `${file} has no kind`);
  }
  for (const [file, entry] of Object.entries(table.agents)) {
    const source = entry.generatedFrom ?? file;
    assert.ok(fs.existsSync(path.join(ROOT, source)), `${file}: ${source} is missing`);
  }
});

test('every skill entry holds the kind values in the fields it lists', () => {
  for (const [file, entry] of Object.entries(table.skills)) {
    const kind = table.kinds[entry.kind];
    for (const field of entry.fields) {
      assert.equal(frontmatterField(file, field), kind[field], `${file} ${field}`);
    }
  }
});

test('every dispatch match is one line holding one model word, the kind\'s', () => {
  for (const { file, match, kind } of table.dispatches) {
    const lines = readRepoFile(file).split('\n').filter((line) => line.includes(match));
    assert.equal(lines.length, 1, `${file}: "${match}" matches ${lines.length} lines`);
    const words = [...lines[0].matchAll(MODEL_WORD)].map((found) => found[1]);
    assert.deepEqual(words, [table.kinds[kind].model], `${file}: "${match}"`);
  }
});
