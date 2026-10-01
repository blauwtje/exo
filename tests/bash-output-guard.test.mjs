// The Bash output guard caps a known-verbose command that prints its whole
// output, denies a whole-file shell read of a large file and names the bounded
// form, lets a bounded or chained command through, and stands down when guards is off.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/bash-output-guard.mjs', import.meta.url));
const BIG = Array.from({ length: 2000 }, (_, index) => `line ${index + 1}`).join('\n');

function runGuard(hookInput, { directory, environment = {} }) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [GUARD],
      {
        cwd: directory,
        env: { ...process.env, CLAUDE_CONFIG_DIR: `${directory}-config`, CLAUDE_PROJECT_DIR: directory, ...environment },
        timeout: 30_000
      },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput));
  });
}

async function bigFileFixture() {
  const directory = await fs.realpath(await fixture());
  await fs.writeFile(path.join(directory, 'big.log'), BIG);
  await fs.writeFile(path.join(directory, 'small.log'), 'one\ntwo\n');
  return directory;
}

async function verdict(command, options = {}) {
  const directory = options.directory ?? (await bigFileFixture());
  const result = await runGuard({ tool_name: 'Bash', cwd: directory, tool_input: { command } }, { directory, environment: options.environment });
  assert.equal(result.stderr, '');
  assert.equal(result.code, 0);
  if (result.stdout === '') return { denied: false, reason: '' };
  const decision = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(decision.hookEventName, 'PreToolUse');
  return { denied: decision.permissionDecision === 'deny', reason: decision.permissionDecisionReason, decision };
}

// The verdict of a verbose command: the command it runs instead, or null.
async function cappedTo(command) {
  const { denied, decision } = await verdict(command);
  assert.equal(denied, false, command);
  assert.equal(decision?.permissionDecision, undefined, command);
  return decision?.updatedInput?.command ?? null;
}

test('a bare test command runs tail-capped, with no permission decision', async () => {
  const directory = await bigFileFixture();
  const toolInput = { command: 'npm test', description: 'run the tests' };
  const result = await runGuard({ tool_name: 'Bash', cwd: directory, tool_input: toolInput }, { directory });
  assert.deepEqual(JSON.parse(result.stdout).hookSpecificOutput, {
    hookEventName: 'PreToolUse',
    updatedInput: { command: 'set -o pipefail; npm test 2>&1 | tail -n 200', description: 'run the tests' }
  });
});

test('each runner form on the list runs capped', async () => {
  for (const command of ['uv run pytest -x', 'cargo test --release', 'git -C /tmp/repo log', 'git shortlog -s', 'npx tsc --noEmit']) {
    assert.equal(await cappedTo(command), `set -o pipefail; ${command} 2>&1 | tail -n 200`, command);
  }
});

test('a command already piped, redirected or chained passes', async () => {
  for (const command of ['npm test | tail -5', 'npm test > out.txt', 'npm test && echo done', 'npm test; echo done', 'echo $(npm test)']) {
    assert.equal(await cappedTo(command), null, command);
  }
});

test('a pipe or ampersand inside quoted text does not count as a chain', async () => {
  assert.equal(await cappedTo('git log --format="%h|%s"'), 'set -o pipefail; git log --format="%h|%s" 2>&1 | tail -n 200');
});

test('a git log with a count limit passes', async () => {
  for (const command of ['git log -5', 'git log -n 5', 'git log --max-count=5']) {
    assert.equal(await cappedTo(command), null, command);
  }
});

test('a command off the list passes', async () => {
  for (const command of ['ls -la', 'git status', 'npm install']) {
    assert.equal((await verdict(command)).denied, false, command);
  }
});

test('cat of a large file is denied with the located-range advice', async () => {
  const { denied, reason } = await verdict('cat big.log');
  assert.equal(denied, true);
  assert.match(reason, /^cat on .*big\.log: \d+ bytes \(>12000, about \d+ tokens\)/);
  assert.match(reason, /sed -n 'A,Bp' under 300 lines/);
});

test('cat of a small file passes', async () => {
  assert.equal((await verdict('cat small.log')).denied, false);
});

test('the byte cap follows READ_GUARD_MAX_BYTES', async () => {
  const environment = { READ_GUARD_MAX_BYTES: '5' };
  assert.equal((await verdict('cat small.log', { environment })).denied, true);
});

test('sed with a range under 300 lines passes, an open or wide range is denied', async () => {
  assert.equal((await verdict("sed -n '10,200p' big.log")).denied, false);
  assert.equal((await verdict("sed -n '10,$p' big.log")).denied, true);
  assert.equal((await verdict("sed -n '1,900p' big.log")).denied, true);
  assert.equal((await verdict("sed 's/a/b/' big.log")).denied, true);
});

test('head past 300 lines is denied, up to 300 passes', async () => {
  assert.equal((await verdict('head -n 400 big.log')).denied, true);
  assert.equal((await verdict('head -400 big.log')).denied, true);
  assert.equal((await verdict('head -n 50 big.log')).denied, false);
  assert.equal((await verdict('head big.log')).denied, false);
});

test('a later stage that bounds the output lets the read through', async () => {
  assert.equal((await verdict('cat big.log | head -20')).denied, false);
  assert.equal((await verdict('cat big.log | grep line')).denied, false);
  assert.equal((await verdict('cat big.log | sort')).denied, true);
  assert.equal((await verdict('cat big.log && head -3 small.log')).denied, true);
});

test('a read after cd resolves against the new directory', async () => {
  const directory = await bigFileFixture();
  const parent = path.dirname(directory);
  const command = `cd ${path.basename(directory)} && cat big.log`;
  const result = await runGuard({ tool_name: 'Bash', cwd: parent, tool_input: { command } }, { directory });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('a quoted path with a space is read as one file', async () => {
  const directory = await bigFileFixture();
  await fs.writeFile(path.join(directory, 'big file.log'), BIG);
  assert.equal((await verdict("cat 'big file.log'", { directory })).denied, true);
});

test('a path under the config directory is exempt, a project .claude path is not', async () => {
  const directory = await bigFileFixture();
  const configuration = await fs.realpath(await fixture());
  await fs.writeFile(path.join(configuration, 'notes.md'), BIG);
  const environment = { CLAUDE_CONFIG_DIR: configuration };
  assert.equal((await verdict(`cat ${path.join(configuration, 'notes.md')}`, { directory, environment })).denied, false);
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'notes.md'), BIG);
  assert.equal((await verdict('cat .claude/notes.md', { directory, environment })).denied, true);
});

test('a path under the plugin root is exempt', async () => {
  const directory = await bigFileFixture();
  const pluginRoot = await fs.realpath(await fixture());
  await fs.writeFile(path.join(pluginRoot, 'skill.md'), BIG);
  const environment = { CLAUDE_PLUGIN_ROOT: pluginRoot };
  assert.equal((await verdict(`cat ${path.join(pluginRoot, 'skill.md')}`, { directory, environment })).denied, false);
});

test('a command with an unterminated quote passes', async () => {
  assert.equal((await verdict("cat 'big.log")).denied, false);
});

test('guards off in the project settings switches the guard off', async () => {
  const directory = await bigFileFixture();
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), JSON.stringify({ guards: 'off' }));
  assert.equal((await verdict('cat big.log', { directory })).denied, false);
  assert.equal((await verdict('npm test', { directory })).decision, undefined);
});

test('an empty or unparsable input passes with no output', async () => {
  const directory = await fixture();
  for (const input of ['', 'not json', '{}']) {
    const result = await runGuard(input, { directory });
    assert.equal(result.stdout, '');
    assert.equal(result.code, 0);
  }
});
