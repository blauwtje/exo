// The expand-reply hook restates the last reply in full on a lone `?` prompt,
// reminds the terse level on every other prompt under `replies=terse`, and
// stays silent otherwise or on malformed input.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const EXPAND_REPLY = path.join(REPOSITORY, 'skills', 'configure', 'scripts', 'expand-reply.mjs');
const TERSE_RULE = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'skills', 'configure', 'schema.json'), 'utf8')).replies.rules.terse;

// An empty project and config directory keep the caller's own settings out of the run.
const EMPTY_DIRECTORY = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-reply-'));

function projectWith(replies) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-reply-project-'));
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ replies }));
  return project;
}

function runExpandReply(input, project = EMPTY_DIRECTORY) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CLAUDE_CONFIG_DIR: EMPTY_DIRECTORY, CLAUDE_PLUGIN_OPTION_REPLIES: '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [EXPAND_REPLY],
      { timeout: 30_000, env },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

test('a lone question mark prints one additionalContext string', async () => {
  const result = await runExpandReply({ session_id: 's1', prompt: '?' });
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(typeof output.hookSpecificOutput.additionalContext, 'string');
  assert.match(output.hookSpecificOutput.additionalContext, /last reply in full/);
});

test('surrounding whitespace around the question mark still counts', async () => {
  const result = await runExpandReply({ prompt: '  ?\n' });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});

for (const prompt of ['??', 'why?', '? why', 'what is this?', '', 'hello']) {
  test(`the prompt ${JSON.stringify(prompt)} prints nothing`, async () => {
    const result = await runExpandReply({ prompt });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
  });
}

test('input without a string prompt prints nothing', async () => {
  const result = await runExpandReply({ session_id: 's1' });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('malformed input exits 0 with nothing on stdout', async () => {
  const result = await runExpandReply('not json');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('under replies=terse every other prompt prints the terse reminder', async () => {
  const project = projectWith('terse');
  for (const prompt of ['hello', 'why?', '']) {
    const result = await runExpandReply({ prompt }, project);
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    const { additionalContext } = output.hookSpecificOutput;
    assert.match(additionalContext, /replies=terse/);
    assert.ok(additionalContext.includes('never write a, an or the'), additionalContext);
    assert.ok(additionalContext.includes('never write is, are, was or were'), additionalContext);
    assert.ok(additionalContext.length < 360, `reminder is ${additionalContext.length} characters`);
  }
});

test('the terse reminder names every keep-whole item and exemption of the schema terse rule', async () => {
  const keepWhole = 'Code, commands, paths, identifiers, error text, numbers and every not, no, only and except stay whole.';
  const exemptions = 'Commits, PR text, docs, code comments and saved files keep normal prose.';
  const result = await runExpandReply({ prompt: 'hello' }, projectWith('terse'));
  const { additionalContext } = JSON.parse(result.stdout).hookSpecificOutput;
  for (const sentence of [keepWhole, exemptions]) {
    assert.ok(TERSE_RULE.includes(sentence), `the schema terse rule lacks: ${sentence}`);
    assert.ok(additionalContext.includes(sentence), `the reminder lacks: ${sentence}`);
  }
});

test('under replies=terse a lone question mark still prints the expansion, not the reminder', async () => {
  const result = await runExpandReply({ prompt: '?' }, projectWith('terse'));
  const { additionalContext } = JSON.parse(result.stdout).hookSpecificOutput;
  assert.match(additionalContext, /last reply in full/);
  assert.doesNotMatch(additionalContext, /replies=terse/);
});

test('under replies=tight and replies=standard a prompt prints nothing', async () => {
  for (const replies of ['tight', 'standard']) {
    const result = await runExpandReply({ prompt: 'hello' }, projectWith(replies));
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
  }
});

test('an unparseable project exo.json prints nothing and exits 0', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-reply-project-'));
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.json'), '{ not json');
  const result = await runExpandReply({ prompt: 'hello' }, project);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

function stateFile(sessionId) {
  return path.join(EMPTY_DIRECTORY, 'exo', 'terse', `${sessionId}.json`);
}

function seedState(sessionId, state) {
  fs.mkdirSync(path.dirname(stateFile(sessionId)), { recursive: true });
  fs.writeFileSync(stateFile(sessionId), JSON.stringify(state));
}

const FEEDBACK = { rate: 6.4, sentence: 'Config lives in project file.' };

test('under replies=terse the next prompt appends the note and clears the feedback', async () => {
  const project = projectWith('terse');
  seedState('note-once', { expand: false, feedback: FEEDBACK });
  const first = await runExpandReply({ session_id: 'note-once', prompt: 'hello' }, project);
  const { additionalContext } = JSON.parse(first.stdout).hookSpecificOutput;
  assert.match(additionalContext, /^replies=terse: /);
  const note = additionalContext.slice(additionalContext.indexOf('Last reply:'));
  assert.equal(note, 'Last reply: 6.4 articles/100 words, limit 2.0. Tighter: "Config lives in project file."');
  assert.ok(note.length <= 240, `note is ${note.length} characters`);
  assert.equal(fs.existsSync(stateFile('note-once')), false);
  const second = await runExpandReply({ session_id: 'note-once', prompt: 'hello' }, project);
  assert.doesNotMatch(JSON.parse(second.stdout).hookSpecificOutput.additionalContext, /Last reply:/);
});

test('the note stays within 240 characters for the longest tightened sentence', async () => {
  seedState('note-long', { expand: false, feedback: { rate: 100.55, sentence: 'x'.repeat(120) } });
  const result = await runExpandReply({ session_id: 'note-long', prompt: 'hello' }, projectWith('terse'));
  const { additionalContext } = JSON.parse(result.stdout).hookSpecificOutput;
  const note = additionalContext.slice(additionalContext.indexOf('Last reply:'));
  assert.ok(note.length <= 240, `note is ${note.length} characters`);
});

test('a lone question mark sets expand and keeps the pending feedback', async () => {
  seedState('note-expand', { expand: false, feedback: FEEDBACK });
  await runExpandReply({ session_id: 'note-expand', prompt: '?' }, projectWith('terse'));
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile('note-expand'), 'utf8')), { expand: true, feedback: FEEDBACK });
  const next = await runExpandReply({ session_id: 'note-expand', prompt: 'thanks' }, projectWith('terse'));
  assert.match(JSON.parse(next.stdout).hookSpecificOutput.additionalContext, /Last reply: 6\.4 articles/);
  assert.equal(fs.existsSync(stateFile('note-expand')), false);
});

test('a prompt under another level prints nothing and still clears the feedback', async () => {
  seedState('note-standard', { expand: true, feedback: FEEDBACK });
  const result = await runExpandReply({ session_id: 'note-standard', prompt: 'hello' }, projectWith('standard'));
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(stateFile('note-standard')), false);
});

test('an invalid session id prints the reminder without a note', async () => {
  const result = await runExpandReply({ session_id: '../escape', prompt: 'hello' }, projectWith('terse'));
  const { additionalContext } = JSON.parse(result.stdout).hookSpecificOutput;
  assert.doesNotMatch(additionalContext, /Last reply:/);
});
