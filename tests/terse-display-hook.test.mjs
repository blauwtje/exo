// The terse-display MessageDisplay hook removes stray articles from each
// streamed delta under `replies=terse`, carries the fence state of one message
// in the session's terse state, prints only when the text changed, and exits 0
// with nothing on stdout on any fault or skipped turn.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const TERSE_DISPLAY = path.join(REPOSITORY, 'skills', 'configure', 'scripts', 'terse-display.mjs');
const SESSION = '11111111-2222-4333-8444-555555555555';

function sandbox(replies) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'terse-display-project-'));
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'terse-display-config-'));
  if (replies !== undefined) {
    fs.mkdirSync(path.join(project, '.claude'));
    fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ replies }));
  }
  return { project, config };
}

function stateFile({ config }) {
  return path.join(config, 'exo', 'terse', `${SESSION}.json`);
}

function writeState(box, state) {
  fs.mkdirSync(path.dirname(stateFile(box)), { recursive: true });
  fs.writeFileSync(stateFile(box), `${JSON.stringify(state)}\n`);
}

function readState(box) {
  const file = stateFile(box);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function runHook(input, box) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: box.project, CLAUDE_CONFIG_DIR: box.config, CLAUDE_PLUGIN_OPTION_REPLIES: '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [TERSE_DISPLAY],
      { timeout: 30_000, env },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

const flush = (delta, extra = {}) => ({
  session_id: SESSION,
  hook_event_name: 'MessageDisplay',
  message_id: 'm1',
  index: 0,
  final: true,
  delta,
  ...extra,
});

function displayed(result) {
  return JSON.parse(result.stdout).hookSpecificOutput;
}

test('a terse delta prints its filtered text as displayContent', async () => {
  const result = await runHook(flush('The hook reads the setting, so a reminder fires.'), sandbox('terse'));
  assert.equal(result.code, 0);
  assert.deepEqual(displayed(result), {
    hookEventName: 'MessageDisplay',
    displayContent: 'Hook reads setting, so reminder fires.',
  });
});

test('a delta the filter leaves unchanged prints nothing', async () => {
  const result = await runHook(flush('Hook reads setting, so reminder fires.'), sandbox('terse'));
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('a level other than terse prints nothing and writes nothing', async () => {
  for (const replies of [undefined, 'normal']) {
    const box = sandbox(replies);
    const result = await runHook(flush('The hook reads the setting, so a reminder fires.', { final: false }), box);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '', `replies=${replies}`);
    assert.equal(readState(box), null, `replies=${replies}`);
  }
});

test('the reply to a lone question mark prints nothing and keeps the state', async () => {
  const box = sandbox('terse');
  writeState(box, { expand: true, feedback: null });
  const result = await runHook(flush('The hook reads the setting, so a reminder fires.'), box);
  assert.equal(result.stdout, '');
  assert.deepEqual(readState(box), { expand: true, feedback: null });
});

test('an open fence carries to the next flush of the same message and clears on the final one', async () => {
  const box = sandbox('terse');
  const first = await runHook(flush('The plan is this:\n```js\nconst a = the;\n', { final: false }), box);
  assert.equal(displayed(first).displayContent, 'Plan is this:\n```js\nconst a = the;\n');
  assert.deepEqual(readState(box), { expand: false, feedback: null, display: { messageId: 'm1', inFence: true } });
  const second = await runHook(flush('the code = a;\n', { final: false, index: 1 }), box);
  assert.equal(second.stdout, '');
  assert.deepEqual(readState(box).display, { messageId: 'm1', inFence: true });
  const third = await runHook(flush('```\nThe end of the plan.', { index: 2 }), box);
  assert.equal(displayed(third).displayContent, '```\nEnd of plan.');
  assert.equal(readState(box), null);
});

test('a new message id starts outside a fence', async () => {
  const box = sandbox('terse');
  writeState(box, { expand: false, feedback: null, display: { messageId: 'old', inFence: true } });
  const result = await runHook(flush('The hook reads the setting.', { final: false }), box);
  assert.equal(displayed(result).displayContent, 'Hook reads setting.');
  assert.deepEqual(readState(box).display, { messageId: 'm1', inFence: false });
});

test('pending feedback survives a flush', async () => {
  const box = sandbox('terse');
  const feedback = { rate: 6.4, sentence: 'build fails.' };
  writeState(box, { expand: false, feedback });
  await runHook(flush('The hook reads the setting.', { final: false }), box);
  assert.deepEqual(readState(box), { expand: false, feedback, display: { messageId: 'm1', inFence: false } });
  await runHook(flush('', { index: 1 }), box);
  assert.deepEqual(readState(box), { expand: false, feedback });
});

test('the brief proof input prints the filtered sentence', async () => {
  const box = sandbox('terse');
  const result = await runHook(flush('The hook reads the setting, so a reminder fires.', { message_id: 'm1' }), box);
  assert.match(result.stdout, /"displayContent":"Hook reads setting, so reminder fires\."/);
});

for (const input of [
  'not json',
  '{}',
  JSON.stringify({ session_id: SESSION, message_id: 'm1', delta: 7 }),
  JSON.stringify({ session_id: SESSION, delta: 'The hook reads the setting.' }),
]) {
  test(`the input ${input} exits 0 with nothing on stdout`, async () => {
    const box = sandbox('terse');
    const result = await runHook(input, box);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(fs.existsSync(path.join(box.config, 'exo')), false);
  });
}

test('a session id that is not valid still filters and writes nothing', async () => {
  const box = sandbox('terse');
  const result = await runHook(flush('The hook reads the setting.', { session_id: '../escape', final: false }), box);
  assert.equal(displayed(result).displayContent, 'Hook reads setting.');
  assert.equal(fs.existsSync(path.join(box.config, 'exo')), false);
});
