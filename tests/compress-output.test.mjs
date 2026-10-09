// compress-output wraps only plain-word test, build, install and log commands,
// and its runner keeps failures, the summary and the exit code while the full
// output lands in a scratch file.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { condense, wrapCommand } from '../lib/compress-output.mjs';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { fixture } from './harness.mjs';

const RUNNER = fileURLToPath(new URL('../lib/compress-output.mjs', import.meta.url));
const bash = (command, extra = {}) => ({ tool_name: 'Bash', tool_input: { command, ...extra } });
const wrapped = (command, level = 'low') => wrapCommand(bash(command), level)?.hookSpecificOutput.updatedInput.command ?? null;

test('known noisy commands are wrapped at low and high', () => {
  for (const command of ['npm test', 'npm run build', 'pnpm install', 'node --test tests/a.test.mjs', 'pytest -x tests', 'cargo test', 'go test ./...', 'docker logs web', 'git log -n 50']) {
    for (const level of ['low', 'high']) {
      assert.match(wrapped(command, level), new RegExp(`^node '.*compress-output\\.mjs' ${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), command);
    }
  }
});

test('compression off, and any other command, is left alone', () => {
  assert.equal(wrapped('npm test', 'off'), null);
  for (const command of ['ls -la', 'npm run dev', 'npm test --watch', 'git status', 'cat README.md', 'FOO=1 npm test']) {
    assert.equal(wrapped(command), null, command);
  }
  assert.equal(wrapCommand({ tool_name: 'Read', tool_input: { command: 'npm test' } }, 'low'), null);
  assert.equal(wrapCommand(bash('npm test', { run_in_background: true }), 'low'), null);
});

test('shell syntax is never wrapped', () => {
  for (const command of ['npm test | head', 'npm test; rm -rf x', 'npm test && rm x', 'npm test > out', 'npm test $(id)', 'npm test `id`', 'npm test "a b"', "npm test 'a'", 'npm test\nrm x', 'npm test *', 'npm test &']) {
    assert.equal(wrapped(command), null, JSON.stringify(command));
  }
});

test('a cd prefix is kept outside the runner', () => {
  assert.match(wrapped('cd /tmp/work && npm test'), /^cd \/tmp\/work && node '.*' npm test$/);
  assert.equal(wrapped('cd "/tmp/a b" && npm test'), null);
});

test('the dispatcher passes updatedInput through, and a denied command is not wrapped', async () => {
  const updated = { command: 'x' };
  const wrap = () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: updated } });
  assert.deepEqual((await dispatchBash(bash('npm test'), [], wrap)).hookSpecificOutput.updatedInput, updated);
  const denied = await dispatchBash(bash('git reset --hard'), undefined, wrap);
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(denied.hookSpecificOutput.updatedInput, undefined);
  const faulty = await dispatchBash(bash('npm test'), [], () => { throw new Error('boom'); });
  assert.equal(faulty, null);
});

test('condense keeps a short output whole', () => {
  assert.equal(condense('a\nb\n', 0, '/f'), 'a\nb\nexit 0; full output: /f\n');
});

test('condense keeps failures, the tail and the exit code of a long output', () => {
  const lines = Array.from({ length: 200 }, (_, index) => (index === 50 ? 'not ok 51 - broken' : `ok ${index}`));
  const text = condense(`${lines.join('\n')}\n`, 1, '/f');
  assert.match(text, /\[200 lines, compressed\]/);
  assert.match(text, /not ok 51 - broken/);
  assert.match(text, /ok 199/);
  assert.doesNotMatch(text, /ok 20\n/);
  assert.match(text, /exit 1; full output: \/f/);
});

test('the runner keeps the exit code and writes the full output to a scratch file', async () => {
  const directory = await fixture();
  spawnSync('git', ['init', '-q'], { cwd: directory });
  const script = 'for (let i = 0; i < 120; i += 1) console.log(i === 7 ? "FAIL here" : `line ${i}`); process.exit(3);';
  const result = spawnSync('node', [RUNNER, 'node', '-e', script], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /FAIL here/);
  assert.doesNotMatch(result.stdout, /line 50\n/);
  const file = /full output: (.+)\n/.exec(result.stdout)[1];
  assert.match(file, /\.exo[\\/]output[\\/]/);
  assert.match(fs.readFileSync(file, 'utf8'), /line 50\n/);
});

test('the runner without a command exits 2', () => {
  assert.equal(spawnSync('node', [RUNNER]).status, 2);
});
