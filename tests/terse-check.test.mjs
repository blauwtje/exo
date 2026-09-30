// The terse-check Stop hook scores the last reply under `replies=terse` and
// keeps `{ rate, sentence }` in the session's feedback state when it runs over
// the article limit. It skips every turn the terse rule does not cover, never
// blocks a reply, and exits 0 with nothing on stdout on any fault.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const TERSE_CHECK = path.join(REPOSITORY, 'skills', 'configure', 'scripts', 'terse-check.mjs');

const WORDY =
  'The function reads the file from the disk and then the parser builds a tree from the tokens. ' +
  'The tree goes to the writer, which saves the result in a cache for the next run of the tool.';
const TERSE_TEXT =
  'Function reads file, parser builds tree, writer saves result. Cache serves next run. Nothing else changes here, so ship it now and move on to following task without delay.';

function sandbox(replies) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'terse-check-project-'));
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'terse-check-config-'));
  if (replies !== undefined) {
    fs.mkdirSync(path.join(project, '.claude'));
    fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ replies }));
  }
  return { project, config };
}

function stateFile({ config }, sessionId = 's1') {
  return path.join(config, 'exo', 'terse', `${sessionId}.json`);
}

function readState(box, sessionId) {
  const file = stateFile(box, sessionId);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function runTerseCheck(input, box) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: box.project, CLAUDE_CONFIG_DIR: box.config, CLAUDE_PLUGIN_OPTION_REPLIES: '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [TERSE_CHECK],
      { timeout: 30_000, env },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

const stopInput = (message, extra = {}) => ({ session_id: 's1', last_assistant_message: message, ...extra });

test('a terse reply over the limit writes its rate and a tightened sentence, and never blocks', async () => {
  const box = sandbox('terse');
  const result = await runTerseCheck(stopInput(WORDY), box);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  const state = readState(box);
  assert.equal(state.expand, false);
  assert.ok(state.feedback.rate > 2.0, `rate ${state.feedback.rate}`);
  assert.equal(state.feedback.sentence, 'function reads file from disk and then parser builds tree from tokens.');
});

test('a terse reply at or under the limit writes nothing', async () => {
  const box = sandbox('terse');
  await runTerseCheck(stopInput(TERSE_TEXT), box);
  assert.equal(readState(box), null);
});

test('a level other than terse writes nothing', async () => {
  for (const replies of [undefined, 'normal']) {
    const box = sandbox(replies);
    const result = await runTerseCheck(stopInput(WORDY), box);
    assert.equal(result.code, 0);
    assert.equal(readState(box), null, `replies=${replies}`);
  }
});

test('a Stop hook already continuing a turn writes nothing', async () => {
  const box = sandbox('terse');
  await runTerseCheck(stopInput(WORDY, { stop_hook_active: true }), box);
  assert.equal(readState(box), null);
});

test('a reply under 25 chat words writes nothing', async () => {
  const box = sandbox('terse');
  await runTerseCheck(stopInput('The tree goes to the writer, which saves the result in the cache.'), box);
  assert.equal(readState(box), null);
});

test('a reply answering a lone question mark writes nothing', async () => {
  const box = sandbox('terse');
  fs.mkdirSync(path.dirname(stateFile(box)), { recursive: true });
  fs.writeFileSync(stateFile(box), `${JSON.stringify({ expand: true, feedback: null })}\n`);
  await runTerseCheck(stopInput(WORDY), box);
  assert.deepEqual(readState(box), { expand: true, feedback: null });
});

test('a reply whose last sentence ends in a question mark writes nothing', async () => {
  const box = sandbox('terse');
  await runTerseCheck(stopInput(`${WORDY} Should I delete the old cache from the disk?`), box);
  assert.equal(readState(box), null);
});

test('a session id that is not valid writes nothing', async () => {
  const box = sandbox('terse');
  const result = await runTerseCheck(stopInput(WORDY, { session_id: '../escape' }), box);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(box.config, 'exo')), false);
});

for (const input of ['not json', '{}', JSON.stringify({ session_id: 's1', last_assistant_message: 7 })]) {
  test(`the input ${input} exits 0 with nothing on stdout`, async () => {
    const box = sandbox('terse');
    const result = await runTerseCheck(input, box);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(readState(box), null);
  });
}
