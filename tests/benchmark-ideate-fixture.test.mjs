import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const questions = JSON.parse(fs.readFileSync('benchmarks/agent-tier/ideate/questions.json', 'utf8'));
const agents = JSON.parse(fs.readFileSync('benchmarks/agent-tier/agents.json', 'utf8'));

function planOutput() {
  const run = spawnSync('node', ['skills/spec/scripts/plan.mjs', '--seed', '1', '--agents', '4'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  return run.stdout;
}

test('personas and idea count equal the plan.mjs output for seed 1 and 4 agents', () => {
  const plan = planOutput();
  const ideas = Number(plan.match(/^Ideas: (\d+)$/m)[1]);
  const personas = [...plan.matchAll(/^Persona \d+: (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(questions.map((entry) => entry.persona), personas);
  for (const entry of questions) assert.equal(entry.ideas, ideas);
});

test('each question holds a digest and three banned and three held-back defaults, all distinct', () => {
  for (const entry of questions) {
    assert.ok(entry.question && entry.grounding);
    assert.equal(entry.banned.length, 3);
    assert.equal(entry.heldBack.length, 3);
    assert.equal(new Set([...entry.banned, ...entry.heldBack]).size, 6);
  }
});

test('the ideate-worker entry is a research kind and its fixtures name questions', () => {
  const entry = agents['ideate-worker'];
  const ids = questions.map((question) => question.id);
  assert.equal(entry.kind, 'research');
  assert.deepEqual(entry.fixtures.full, ids);
  assert.deepEqual(entry.fixtures.quick, [ids[0]]);
  assert.ok(entry.profile.input > 0);
});
