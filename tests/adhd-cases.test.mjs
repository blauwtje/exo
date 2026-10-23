import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../benchmarks/adhd/cases.jsonl', import.meta.url);
const cases = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const strings = (list) => Array.isArray(list) && list.length > 0 && list.every((s) => typeof s === 'string' && s.trim());

test('at least 20 cases with unique ids', () => {
  assert.ok(cases.length >= 20, `got ${cases.length}`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
});

test('every case has the full shape', () => {
  for (const c of cases) {
    assert.deepEqual(Object.keys(c).sort(), ['context', 'facts', 'id', 'lead', 'literals', 'question', 'source']);
    for (const key of ['id', 'source', 'context', 'question']) assert.ok(typeof c[key] === 'string' && c[key].trim(), `${c.id}.${key}`);
    assert.ok(strings(c.facts), `${c.id}.facts`);
    assert.ok(Array.isArray(c.lead) && c.lead.every((s) => typeof s === 'string'), `${c.id}.lead`);
    assert.ok(Array.isArray(c.literals) && c.literals.every(strings), `${c.id}.literals`);
  }
});

test('the 4 failure cases are present', () => {
  const ids = cases.map((c) => c.id);
  for (const id of ['failure-q1', 'failure-q2', 'failure-q3', 'failure-q4']) assert.ok(ids.includes(id), id);
});

test('literals appear in the context or question', () => {
  for (const c of cases) {
    const text = `${c.context} ${c.question}`.toLowerCase();
    for (const variants of c.literals) assert.ok(variants.some((v) => text.includes(v.toLowerCase())), `${c.id}: ${variants[0]}`);
  }
});

test('no private details', () => {
  const raw = readFileSync(file, 'utf8');
  assert.doesNotMatch(raw, /\/Users\/|\/home\/|@[\w-]+\.\w+|sk-[A-Za-z0-9]{8}|thomas|hoogteijling|newdata/i);
});
