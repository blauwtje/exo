import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { descriptionHashes, evaluate, gradeStream, modelInvocableSkills } from '../benchmarks/routing.mjs';

const root = new URL('..', import.meta.url).pathname;
const line = (content) => JSON.stringify({ type: 'assistant', message: { content } });

test('grade takes the first tool_use: a Skill name, or none for another tool or no tool', () => {
  const skill = line([{ type: 'tool_use', name: 'Skill', input: { skill: 'exo:build' } }]);
  const bash = line([{ type: 'tool_use', name: 'Bash', input: {} }]);
  assert.equal(gradeStream(`{"type":"system"}\n${skill}\n${bash}`), 'build');
  assert.equal(gradeStream(`${bash}\n${skill}`), null);
  assert.equal(gradeStream(line([{ type: 'text', text: 'hi' }])), null);
});

test('evaluate writes cells, arms and per-arm per-split per-skill recall and false-trigger rate', async () => {
  const prompts = [
    { prompt: 'a', expect: 'build', split: 'train' },
    { prompt: 'b', expect: null, split: 'train' }
  ];
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook', 'no-hook'], runs: 2, concurrency: 2, skills: ['build', 'spec'],
    runSession: async ({ prompt, arm }) => (prompt === 'a' || arm === 'hook' ? 'build' : null)
  });
  assert.deepEqual(outcome.cells, ['sonnet:low']);
  assert.deepEqual(outcome.results['sonnet:low'].hook.train.build, { recall: 1, falseTrigger: 1 });
  assert.deepEqual(outcome.results['sonnet:low']['no-hook'].train.build, { recall: 1, falseTrigger: 0 });
  assert.equal(outcome.results['sonnet:low'].hook.train.spec.recall, null);
  assert.equal(outcome.sessions.length, 8);
});

test('descriptionHashes covers each model-invocable skill and session-routing', () => {
  const hashes = descriptionHashes(root);
  const skills = modelInvocableSkills(root);
  assert.ok(skills.includes('build') && !skills.includes('prompt'));
  assert.deepEqual(Object.keys(hashes).sort(), [...skills, 'session-routing'].sort());
  const routing = readFileSync(`${root}hooks/session-routing.md`, 'utf8');
  assert.equal(hashes['session-routing'], createHash('sha256').update(routing).digest('hex'));
  for (const value of Object.values(hashes)) assert.match(value, /^[0-9a-f]{64}$/);
});

test('a failed session is an error outcome: kept out of recall and false-trigger rates, counted per arm', async () => {
  const prompts = [
    { prompt: 'a', expect: 'build', split: 'train' },
    { prompt: 'b', expect: null, split: 'train' }
  ];
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook', 'no-hook'], runs: 2, concurrency: 2, skills: ['build'],
    runSession: async ({ prompt, arm }) => (arm === 'no-hook' ? { error: 'exit 1: login required' } : prompt === 'a' ? 'build' : null)
  });
  assert.deepEqual(outcome.results['sonnet:low']['no-hook'].train.build, { recall: null, falseTrigger: null });
  assert.deepEqual(outcome.results['sonnet:low'].hook.train.build, { recall: 1, falseTrigger: 0 });
  assert.deepEqual(outcome.errors['sonnet:low'], { hook: 0, 'no-hook': 4 });
  const failed = outcome.sessions.filter((session) => session.arm === 'no-hook');
  assert.ok(failed.every((session) => session.pick === null && session.error === 'exit 1: login required'));
});

test('a failed session in a partly failing arm leaves the rates to the sessions that ran', async () => {
  const prompts = [{ prompt: 'a', expect: 'build', split: 'train' }];
  let calls = 0;
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook'], runs: 4, concurrency: 1, skills: ['build'],
    runSession: async () => { calls += 1; return calls % 2 ? { error: 'timeout after 1ms' } : 'build'; }
  });
  assert.deepEqual(outcome.results['sonnet:low'].hook.train.build, { recall: 1, falseTrigger: null });
  assert.equal(outcome.errors['sonnet:low'].hook, 2);
});
