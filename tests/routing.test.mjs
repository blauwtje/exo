// Routing books one line per turn: the skills that fired in it, or none, with
// no request text anywhere in the record. A delegate's skill call is not the
// main thread's routing and is not booked.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const ROUTING = fileURLToPath(new URL('../skills/savings/scripts/routing.mjs', import.meta.url));

function runRouting(args, hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [ROUTING, ...args],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.end(typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput));
  });
}

async function routingFixture() {
  const configDirectory = await fixture();
  return { env: { CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: '' }, configDirectory };
}

function recordFile(configDirectory) {
  return path.join(configDirectory, 'exo', 'savings', 'sessions.json');
}

async function routing(configDirectory) {
  const sessions = JSON.parse(await fs.readFile(recordFile(configDirectory), 'utf8'));
  return sessions.s1.routing;
}

const PROMPT = { session_id: 's1', prompt: 'deploy with the token hunter2' };
const SKILL = { session_id: 's1', tool_name: 'Skill', tool_input: { skill: 'exo:shaping' } };
const STOP = { session_id: 's1' };

test('a turn books every skill that fired in it, by bare name', async () => {
  const { env, configDirectory } = await routingFixture();
  await runRouting(['open'], PROMPT, env);
  await runRouting(['fired'], SKILL, env);
  await runRouting(['fired'], SKILL, env);
  await runRouting(['fired'], { ...SKILL, tool_input: { skill: 'exo:implementing' } }, env);
  await runRouting(['close'], STOP, env);
  assert.deepEqual((await routing(configDirectory)).skills, { shaping: 2, implementing: 1 });
  assert.equal((await routing(configDirectory)).none, 0);
});

test('a turn that closes with no skill named books none, and a second one counts twice', async () => {
  const { env, configDirectory } = await routingFixture();
  await runRouting(['open'], PROMPT, env);
  await runRouting(['close'], STOP, env);
  await runRouting(['open'], PROMPT, env);
  await runRouting(['close'], STOP, env);
  assert.equal((await routing(configDirectory)).none, 2);
  await runRouting(['close'], STOP, env);
  assert.equal((await routing(configDirectory)).none, 2);
});

test('no request text reaches the record', async () => {
  const { env, configDirectory } = await routingFixture();
  await runRouting(['open'], PROMPT, env);
  await runRouting(['close'], STOP, env);
  const text = await fs.readFile(recordFile(configDirectory), 'utf8');
  assert.doesNotMatch(text, /hunter2|deploy/);
});

test("a delegate's skill call is not the main thread's routing", async () => {
  const { env, configDirectory } = await routingFixture();
  await runRouting(['open'], PROMPT, env);
  await runRouting(['fired'], { ...SKILL, agent_id: 'a1' }, env);
  await runRouting(['close'], STOP, env);
  const booked = await routing(configDirectory);
  assert.deepEqual(booked.skills, {});
  assert.equal(booked.none, 1);
});

test('EXO_SAVINGS=off books nothing', async () => {
  const { env, configDirectory } = await routingFixture();
  const off = { ...env, EXO_SAVINGS: 'off' };
  await runRouting(['open'], PROMPT, off);
  await runRouting(['fired'], SKILL, off);
  await runRouting(['close'], STOP, off);
  assert.equal(await fs.access(recordFile(configDirectory)).catch(() => 'absent'), 'absent');
});

test('a malformed payload exits 0 with no output', async () => {
  const { env } = await routingFixture();
  const result = await runRouting(['open'], 'not json', env);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^routing:/);
});
