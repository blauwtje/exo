import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../benchmarks/adhd/cases.jsonl', import.meta.url);
const cases = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const strings = (list) => Array.isArray(list) && list.length > 0 && list.every((s) => typeof s === 'string' && s.trim());

test('34 cases with unique ids', () => {
  assert.equal(cases.length, 34);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
});

test('every case has the full shape', () => {
  for (const c of cases) {
    const optional = ['ask', 'deliverable'].filter((k) => k in c);
    assert.deepEqual(Object.keys(c).sort(), ['context', 'facts', 'id', 'lead', 'literals', 'question', 'source', ...optional].sort());
    if ('ask' in c) assert.equal(c.ask, true, `${c.id}.ask`);
    if ('deliverable' in c) assert.doesNotThrow(() => new RegExp(c.deliverable), `${c.id}.deliverable`);
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

test('4 ask, 3 deliverable and 4 explain cases', () => {
  assert.equal(cases.filter((c) => c.ask === true).length, 4);
  assert.equal(cases.filter((c) => typeof c.deliverable === 'string').length, 3);
  assert.equal(cases.filter((c) => c.id.startsWith('explain-')).length, 4);
});

test('explain literals accept a reply that keeps each fact in other words', () => {
  const has = (id, reply) => cases.find((c) => c.id === id).literals.every((variants) => variants.some((v) => reply.includes(v)));
  assert.ok(has('explain-gate-order', 'The code gates run first. Replies that pass go to the judge, which checks each fact with 3 votes. A reply that fails a gate gets the worst score and skips the judge.'));
  assert.ok(has('explain-baseline-file', 'The default arm is built once and kept in baseline.json under the git common dir. A score run uses just the adhd arm. --baseline rebuilds it.'));
});
