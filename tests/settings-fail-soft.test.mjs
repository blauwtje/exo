import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { receiptsOn } from '../hooks/context-limit.mjs';
import { SCHEMA, settingOrDefault } from '../lib/settings-store.mjs';
import { tempDir } from './harness.mjs';

const AGENT_HOOK = fileURLToPath(new URL('../hooks/agent-effort.mjs', import.meta.url));
const SETTINGS = fileURLToPath(new URL('../skills/configure/scripts/settings.mjs', import.meta.url));
const AGENT_CALL = { tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'Reads: none\nx' } };

function project(content) {
  const directory = tempDir('exo-settings-');
  execFileSync('git', ['init', '-q', directory]);
  fs.mkdirSync(path.join(directory, '.claude'));
  fs.writeFileSync(path.join(directory, '.claude', 'exo.local.json'), content);
  return directory;
}

function inProject(directory, work) {
  const saved = { CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
  process.env.CLAUDE_PROJECT_DIR = directory;
  process.env.CLAUDE_CONFIG_DIR = tempDir('exo-config-');
  try {
    return work();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const childEnv = (directory) => ({ ...process.env, CLAUDE_PROJECT_DIR: directory, CLAUDE_CONFIG_DIR: tempDir('exo-config-') });
const malformed = () => project('{"budget": ');
const bogus = (key) => project(JSON.stringify({ [key]: 'bogus' }));

test('the resolver returns the schema default and a note for a bogus value', () => {
  for (const key of ['budget', 'receipts']) {
    const result = settingOrDefault(key, bogus(key));
    assert.equal(result.value, SCHEMA[key].default, key);
    assert.match(result.note, new RegExp(`${key}=bogus is not one of`), key);
  }
});

test('the resolver returns the schema default and a note for a malformed file', () => {
  for (const key of ['budget', 'receipts']) {
    const result = settingOrDefault(key, malformed());
    assert.equal(result.value, SCHEMA[key].default, key);
    assert.match(result.note, /is not valid JSON/, key);
  }
});

test('the resolver has no note for a valid value and still refuses an unknown key', () => {
  assert.deepEqual(settingOrDefault('receipts', project('{"receipts":"off"}')), { value: 'off', note: null });
  assert.throws(() => settingOrDefault('nothing', project('{}')), /unknown setting nothing/);
});

test('receipts take the default for a bogus value or a malformed file and stay off for off', () => {
  assert.equal(inProject(bogus('receipts'), () => receiptsOn()), true);
  assert.equal(inProject(malformed(), () => receiptsOn()), true);
  assert.equal(inProject(project('{"receipts":"off"}'), () => receiptsOn()), false);
});

test('the agent hook applies the default budget for a bogus value or a malformed file', () => {
  for (const directory of [bogus('budget'), malformed()]) {
    const stdout = execFileSync(process.execPath, [AGENT_HOOK], { input: JSON.stringify(AGENT_CALL), env: childEnv(directory), encoding: 'utf8' });
    const { updatedInput } = JSON.parse(stdout).hookSpecificOutput;
    assert.ok(updatedInput.model, 'a model is set');
    assert.ok(updatedInput.effort, 'an effort is set');
  }
});

test('settings get prints the default on stdout and the note on stderr with exit 0', () => {
  for (const [directory, pattern] of [[bogus('budget'), /budget=bogus is not one of/], [malformed(), /is not valid JSON/]]) {
    const result = spawnSync(process.execPath, [SETTINGS, 'get', 'budget'], { env: childEnv(directory), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), SCHEMA.budget.default);
    assert.match(result.stderr, pattern);
  }
});
