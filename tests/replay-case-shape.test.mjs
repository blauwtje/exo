import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { toRegExp } from '../benchmarks/replay/grade.mjs';

const CASES = fileURLToPath(new URL('../benchmarks/replay/cases', import.meta.url));
const ids = fs.readdirSync(CASES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const definitionOf = (id) => JSON.parse(fs.readFileSync(path.join(CASES, id, 'case.json'), 'utf8'));

test('every case folder holds case.json, prompt.md and a matching id', () => {
  for (const id of ids) {
    assert.equal(definitionOf(id).id, id, id);
    assert.equal(fs.existsSync(path.join(CASES, id, 'prompt.md')), true, `${id} prompt.md`);
  }
});

test('every case has a kind, a runnable grade and a task', () => {
  for (const id of ids) {
    const definition = definitionOf(id);
    assert.ok(['case', 'control'].includes(definition.kind), id);
    assert.equal(typeof definition.task, 'string', id);
    assert.equal(definition.grade.type, 'rubric', id);
    assert.equal(typeof definition.grade.rubric, 'string', id);
    for (const pattern of [...(definition.grade.pass ?? []), ...(definition.grade.fail ?? [])]) new RegExp(pattern);
  }
});

test('every ready case with an input folder keeps it non-empty and every case holds no TODO', () => {
  for (const id of ids) {
    const definition = definitionOf(id);
    if (definition.ready === false) continue;
    assert.doesNotMatch(JSON.stringify(definition), /TODO/, id);
    const input = path.join(CASES, id, 'input');
    if (fs.existsSync(input)) assert.ok(fs.readdirSync(input).length > 0, id);
  }
});

test('every constructed case says what is real, edited and assumed or carries fidelity text', () => {
  for (const id of ids) {
    const definition = definitionOf(id);
    if (definition.constructed !== true) continue;
    assert.ok(definition.fidelity_notes || definition.fidelity, id);
  }
});

test('a scaffolded case is a constructed fix-commit case with a full sha', () => {
  for (const id of ids.filter((name) => name.startsWith('real-'))) {
    const definition = definitionOf(id);
    assert.equal(definition.kind, 'case', id);
    assert.equal(definition.constructed, true, id);
    assert.equal(definition.provenance.type, 'fix-commit', id);
    assert.match(definition.provenance.ref, /^[0-9a-f]{40}$/, id);
  }
});

test('no pass pattern of a ready case matches its own prompt', () => {
  for (const id of ids) {
    const definition = definitionOf(id);
    if (definition.ready === false) continue;
    const prompt = fs.readFileSync(path.join(CASES, id, 'prompt.md'), 'utf8');
    for (const pattern of definition.grade.pass ?? []) assert.equal(toRegExp(pattern).test(prompt), false, `${id}: ${pattern}`);
  }
});
