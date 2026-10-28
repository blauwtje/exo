import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));
const SECRET = 'sk-secret-value-123';
const ANTHROPIC = 'sk-ant-should-not-leak';

const STUB = `#!${process.execPath}
import fs from 'node:fs';
fs.writeFileSync(process.env.STUB_RECORD, JSON.stringify({ argv: process.argv.slice(2), env: process.env }));
process.exit(Number(process.env.STUB_EXIT ?? 0));
`;

async function launch(args, { keys = `DEEPSEEK_API_KEY=${SECRET}\n`, extra = {}, withClaude = true } = {}) {
  const home = await fixture();
  const tools = await fixture();
  const directory = path.join(home, '.config', 'exo');
  await fs.mkdir(directory, { recursive: true });
  if (keys !== null) await fs.writeFile(path.join(directory, 'keys.env'), keys);
  if (withClaude) await fs.writeFile(path.join(tools, 'claude'), STUB, { mode: 0o755 });
  const record = path.join(tools, 'record.json');
  const result = await run(CLI, ['claude', ...args], {
    env: { HOME: home, PATH: tools, CLAUDECODE: '', ANTHROPIC_API_KEY: ANTHROPIC, STUB_RECORD: record, ...extra }
  });
  const recorded = JSON.parse(await fs.readFile(record, 'utf8').catch(() => 'null'));
  return { result, recorded };
}

test('a deepseek session gets the provider env, the stored key and no ANTHROPIC_API_KEY, and names no effort', async () => {
  const { result, recorded } = await launch(['--provider', 'deepseek']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(recorded.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(recorded.env.ANTHROPIC_AUTH_TOKEN, SECRET);
  assert.equal(recorded.env.ANTHROPIC_MODEL, 'deepseek-flash');
  assert.equal(recorded.env.CLAUDE_CODE_EFFORT_LEVEL, undefined);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET));
});

test('an effort is mapped for the provider and arguments after the separator pass through untouched', async () => {
  const { result, recorded } = await launch(['--provider', 'deepseek', '--effort', 'xhigh', '--', '--model', 'x', '-p', 'hi']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(recorded.env.CLAUDE_CODE_EFFORT_LEVEL, 'max');
  assert.deepEqual(recorded.argv, ['--model', 'x', '-p', 'hi']);
});

test('the child exit code becomes the exit code', async () => {
  const { result } = await launch(['--provider', 'deepseek'], { extra: { STUB_EXIT: '7' } });
  assert.equal(result.code, 7);
});

test('the claude provider keeps ANTHROPIC_API_KEY, sets no effort and needs no stored key', async () => {
  const { result, recorded } = await launch([], { keys: null });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(recorded.env.ANTHROPIC_API_KEY, ANTHROPIC);
  assert.equal(recorded.env.CLAUDE_CODE_EFFORT_LEVEL, undefined);
});

test('a missing key refuses naming exo key set and starts nothing', async () => {
  const { result, recorded } = await launch(['--provider', 'zai']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /exo key set zai/);
  assert.equal(recorded, null);
});

test('an unknown provider and an unknown effort refuse and start nothing', async () => {
  const provider = await launch(['--provider', 'nope']);
  assert.equal(provider.result.code, 2);
  assert.match(provider.result.stderr, /unknown provider "nope"/);
  assert.equal(provider.recorded, null);
  const prototype = await launch(['--provider', 'constructor']);
  assert.equal(prototype.result.code, 2);
  assert.equal(prototype.recorded, null);
  const effort = await launch(['--provider', 'deepseek', '--effort', 'turbo']);
  assert.equal(effort.result.code, 2);
  assert.match(effort.result.stderr, /unknown effort "turbo"/);
  assert.equal(effort.recorded, null);
});

test('a stray argument or a flag without a value prints the usage', async () => {
  for (const args of [['deepseek'], ['--provider']]) {
    const { result, recorded } = await launch(args);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /usage: exo claude/);
    assert.equal(recorded, null);
  }
});

test('inside a Claude Code session it refuses', async () => {
  const { result, recorded } = await launch(['--provider', 'deepseek'], { extra: { CLAUDECODE: '1' } });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /not inside a Claude Code session/);
  assert.equal(recorded, null);
});

test('a missing claude binary refuses without echoing the key', async () => {
  const { result } = await launch(['--provider', 'deepseek'], { withClaude: false });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /no claude on PATH/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET));
});
