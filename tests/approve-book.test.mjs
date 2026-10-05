// bookSentence prints the book command once per session, in a form approve
// allows; approve allows that command and no other, and never fails a call.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bookSentence } from '../skills/remember/scripts/approve-book.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const APPROVE_BOOK = path.join(REPOSITORY, 'skills', 'remember', 'scripts', 'approve-book.mjs');

function runApprove(input) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [APPROVE_BOOK],
      { timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

test('the sentence names the book command with the session id and the secret rule', () => {
  const sentence = bookSentence('s1');
  assert.match(sentence, /corrects a repository fact, in any language/);
  assert.match(sentence, /memory\.mjs" book --claim "<one sentence>" --quote "<the user's words, verbatim>" --session "s1"/);
  assert.match(sentence, /no password, token or key/);
});

test('no sentence without a session id the approval would accept', () => {
  for (const session of [undefined, '', 17, 's"1', 's$1', 's\n1']) assert.equal(bookSentence(session), null, String(session));
});

// The book command as a session would run it: the one bookSentence prints,
// with its two placeholders filled in, so a refusal below is caused by the
// payload and never by a script path the test spelled differently.
function printedBookCommand() {
  const printed = bookSentence('s1').match(/`(node [^`]+)`/)[1];
  return printed.replace('<one sentence>', 'the verifier reports 17 checks').replace("<the user's words, verbatim>", "no, it's 17");
}

function approve(command, toolName = 'Bash') {
  return runApprove({ tool_name: toolName, tool_input: { command } });
}

test('approve allows the book command the sentence prints', async () => {
  const result = await approve(printedBookCommand());
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
});

test('approve stays silent on anything but that command, so the permission prompt decides', async () => {
  const command = printedBookCommand();
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
  const result = await runApprove('not json');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^approve-book: /);
});
