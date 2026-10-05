// The nudge hook speaks on every main-thread prompt that holds words of the
// user's own, in any language, logs every fire, and never blocks a prompt.
// Its approve mode allows the book command it prints and no other.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const NUDGE = path.join(REPOSITORY, 'skills', 'remember', 'scripts', 'nudge.mjs');

function runNudge(args, input, environment) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [NUDGE, ...args],
      { env: { ...process.env, ...environment }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

async function nudgeFixture() {
  const directory = await fixture();
  return { directory, environment: { CLAUDE_CONFIG_DIR: directory } };
}

function logPath(directory) {
  return path.join(directory, 'exo', 'memory', path.basename(directory), 'nudge-log.jsonl');
}

test('a prompt gets the book command and one log line', async () => {
  const { directory, environment } = await nudgeFixture();
  const result = await runNudge([], { session_id: 's1', cwd: directory, prompt: 'the verifier reports 17 checks' }, environment);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(output.hookSpecificOutput.additionalContext, /only if this prompt corrects a repository fact/);
  assert.match(output.hookSpecificOutput.additionalContext, /book --claim/);
  assert.match(output.hookSpecificOutput.additionalContext, /--session "s1"/);
  assert.match(output.hookSpecificOutput.additionalContext, /no password, token or key/);
  assert.match(output.hookSpecificOutput.additionalContext, /otherwise say nothing about this/);
  const entries = (await fs.readFile(logPath(directory), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, 'nudged');
  assert.equal(entries[0].session, 's1');
  assert.equal(entries[0].prompt, 'the verifier reports 17 checks');
});

test('a prompt in another language fires the same as an English one', async () => {
  const { directory, environment } = await nudgeFixture();
  for (const prompt of ['検証ツールのチェックは17件です', 'Der Prüfer meldet 17 Checks']) {
    const result = await runNudge([], { session_id: 's1', cwd: directory, prompt }, environment);
    assert.equal(result.code, 0, prompt);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /book --claim/, prompt);
  }
});

test('a prompt with no words of the user\'s own is silent and writes nothing', async () => {
  const { directory, environment } = await nudgeFixture();
  const wordless = [
    '',
    '   \n\t ',
    '?',
    '/clear',
    '  /exo:start  ',
    '<command-message>exo:start</command-message>\n<command-name>/exo:start</command-name>\n<command-args></command-args>',
    '<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args>  </command-args>'
  ];
  for (const prompt of wordless) {
    const result = await runNudge([], { session_id: 's1', cwd: directory, prompt }, environment);
    assert.equal(result.code, 0, prompt);
    assert.equal(result.stdout, '', prompt);
  }
  await assert.rejects(fs.readFile(logPath(directory), 'utf8'), { code: 'ENOENT' });
});

test('a slash command with arguments fires, in either form', async () => {
  const { directory, environment } = await nudgeFixture();
  const withArguments = [
    '/exo:remember the verifier reports 17 checks',
    '<command-message>exo:remember</command-message>\n<command-name>/exo:remember</command-name>\n<command-args>the verifier reports 17 checks</command-args>'
  ];
  for (const prompt of withArguments) {
    const result = await runNudge([], { session_id: 's1', cwd: directory, prompt }, environment);
    assert.equal(result.code, 0, prompt);
    assert.notEqual(result.stdout, '', prompt);
  }
});

test('a prompt that is not a string is silent', async () => {
  const { directory, environment } = await nudgeFixture();
  const result = await runNudge([], { session_id: 's1', cwd: directory, prompt: 17 }, environment);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('a delegate is never nudged', async () => {
  const { directory, environment } = await nudgeFixture();
  const result = await runNudge([], { session_id: 's1', agent_id: 'a1', cwd: directory, prompt: 'no, that is wrong' }, environment);
  assert.equal(result.stdout, '');
  await assert.rejects(fs.readFile(logPath(directory), 'utf8'), { code: 'ENOENT' });
});

test('a background-agent completion notice is silent even when its result reads like a correction', async () => {
  const { directory, environment } = await nudgeFixture();
  const prompt = [
    '<system-reminder>',
    '[SYSTEM NOTIFICATION - NOT USER INPUT]',
    '<task-notification>',
    '<task-id>a1</task-id>',
    '<status>completed</status>',
    '<summary>Renamed the config module</summary>',
    '<result>Verdict: the old name was wrong, it is actually config-loader now.</result>',
    '</task-notification>',
    '</system-reminder>'
  ].join('\n');
  const result = await runNudge([], { session_id: 's1', cwd: directory, prompt }, environment);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  await assert.rejects(fs.readFile(logPath(directory), 'utf8'), { code: 'ENOENT' });
});

test('the same words fire once the notification wrapper is gone', async () => {
  const { directory, environment } = await nudgeFixture();
  const result = await runNudge([], { session_id: 's1', cwd: directory, prompt: 'actually the old name was wrong, it is config-loader' }, environment);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /book --claim/);
});

test('a malformed hook payload never blocks the prompt', async () => {
  const { environment } = await nudgeFixture();
  const result = await runNudge([], 'not json', environment);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^nudge: /);
});

// The book command as a session would run it: the one the nudge prints, with
// its two placeholders filled in, so a refusal below is caused by the payload
// and never by a script path the test spelled differently.
async function printedBookCommand() {
  const { directory, environment } = await nudgeFixture();
  const result = await runNudge([], { session_id: 's1', cwd: directory, prompt: 'no, it is 17' }, environment);
  const printed = JSON.parse(result.stdout).hookSpecificOutput.additionalContext.match(/`(node [^`]+)`/)[1];
  return printed.replace('<one sentence>', 'the verifier reports 17 checks').replace("<the user's words, verbatim>", "no, it's 17");
}

function approve(command, toolName = 'Bash') {
  return runNudge(['approve'], { tool_name: toolName, tool_input: { command } });
}

test('approve allows the book command the nudge prints', async () => {
  const command = await printedBookCommand();
  const result = await approve(command);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
});

test('approve stays silent on anything but that command, so the permission prompt decides', async () => {
  const command = await printedBookCommand();
  const refused = [
    command.replace('17 checks', '$(id) checks'),
    command.replace('17 checks', '`id` checks'),
    command.replace('17 checks', '17 \\" ; id ; \\" checks'),
    command.replace('17 checks', '17\nchecks'),
    `${command}; rm -rf ~`,
    `${command} && id`,
    `${command} | tee /tmp/claims`,
    `${command} > /tmp/claims`,
    `cd /tmp && ${command}`,
    `${command} --cwd "/tmp"`,
    command.replace(' book ', ' write '),
    command.replace('memory.mjs"', 'other.mjs"'),
    command.replace('node "', 'node --eval "process.exit()" "'),
    command.replace(/ --claim.*$/, '')
  ];
  for (const candidate of refused) {
    const result = await approve(candidate);
    assert.equal(result.code, 0, candidate);
    assert.equal(result.stdout, '', candidate);
  }
  const otherTool = await approve(command, 'Edit');
  assert.equal(otherTool.stdout, '');
});

test('approve stays silent on a malformed hook payload', async () => {
  const result = await runNudge(['approve'], 'not json');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^nudge: /);
});

test('stats counts fires against bookings', async () => {
  const { directory, environment } = await nudgeFixture();
  await runNudge([], { session_id: 's1', cwd: directory, prompt: 'no, it is 17' }, environment);
  await runNudge([], { session_id: 's2', cwd: directory, prompt: 'the lock is 3889' }, environment);
  await fs.appendFile(logPath(directory), `${JSON.stringify({ date: '2026-09-19', event: 'booked', session: 's1', claim: 'the verifier reports 17 checks' })}\n`);
  const result = await runNudge(['stats', '--cwd', directory], '', environment);
  assert.equal(result.stdout, '2 nudged, 1 booked, 50% hit rate\n');
});

test('stats counts a booking as a hit only when a nudge in its session came first', async () => {
  const { directory, environment } = await nudgeFixture();
  const bookedLine = (session) => `${JSON.stringify({ date: '2026-09-19', event: 'booked', session, claim: 'the lock is 3889' })}\n`;
  await fs.mkdir(path.dirname(logPath(directory)), { recursive: true });
  await fs.appendFile(logPath(directory), bookedLine('s1'));
  await runNudge([], { session_id: 's1', cwd: directory, prompt: 'no, it is 17' }, environment);
  await fs.appendFile(logPath(directory), bookedLine('never-nudged'));
  await fs.appendFile(logPath(directory), bookedLine('s1'));
  await fs.appendFile(logPath(directory), bookedLine('s1'));
  const result = await runNudge(['stats', '--cwd', directory], '', environment);
  assert.match(result.stdout, /^1 nudged, 1 booked, 100% hit rate$/m);
});
