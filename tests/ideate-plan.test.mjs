import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../skills/ideate/scripts/plan.mjs', import.meta.url).pathname;

function run(args, runJson) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ideate-plan-'));
  if (runJson) {
    fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify(runJson));
  }
  const done = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  const lines = done.stdout.trim().split('\n');
  const field = (name) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2);
  const personas = lines.filter((line) => line.startsWith('Persona ')).map((line) => line.replace(/^Persona \d+: /, ''));
  return { field, personas, lines };
}

test('defaults give 3 distinct personas, 5 ideas and 3 workers including the analogist', () => {
  const plan = run(['--seed', '4']);
  assert.equal(plan.field('Agents'), '3');
  assert.equal(plan.field('Ideas'), '5');
  assert.equal(plan.field('Workers'), '3');
  assert.equal(new Set(plan.personas).size, 3);
  assert.ok(plan.personas.includes('Far-domain analogist'));
});

test('fast mode prints 0 workers and keeps the persona count', () => {
  const plan = run(['--mode', 'fast', '--seed', '4']);
  assert.equal(plan.field('Workers'), '0');
  assert.equal(plan.personas.length, 3);
});

test('run.json overrides the counts and flags override run.json', () => {
  const override = { defaults: { ideate: { agents: 4, ideas: 7 } } };
  assert.equal(run(['--seed', '1'], override).personas.length, 4);
  assert.equal(run(['--seed', '1'], override).field('Ideas'), '7');
  assert.equal(run(['--agents', '2', '--ideas', '6'], override).field('Ideas'), '6');
});

test('agents of 1 yields only the analogist and too many agents caps at the pool', () => {
  assert.deepEqual(run(['--agents', '1']).personas, ['Far-domain analogist']);
  const capped = run(['--agents', '99']);
  assert.ok(capped.field('Capped'));
  assert.equal(new Set(capped.personas).size, capped.personas.length);
});

test('the same seed draws the same personas', () => {
  assert.deepEqual(run(['--seed', '9']).personas, run(['--seed', '9']).personas);
});
