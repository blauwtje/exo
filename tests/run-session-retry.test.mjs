import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isTransientProviderError, spawnClaude } from '../skills/build/scripts/run-session.mjs';

const RETRY_MS = 100;
const SUCCESS = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done' });
const TRANSIENT_TEXT = 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}';
const FAILURES = {
  'no result event': TRANSIENT_TEXT,
  'error result event': JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: TRANSIENT_TEXT })
};

function stub(failure, failures) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-retry-'));
  const counter = path.join(dir, 'count');
  const script = `const fs = require('node:fs'); const file = process.argv[1];
const count = (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0) + 1;
fs.writeFileSync(file, String(count));
process.stdout.write((count <= ${failures} ? ${JSON.stringify(failure)} : ${JSON.stringify(SUCCESS)}) + '\\n');`;
  return {
    claude: { command: process.execPath, prefix: ['-e', script, counter] },
    attempts: () => Number(fs.readFileSync(counter, 'utf8')),
    log: path.join(dir, 'session.log')
  };
}

function run(session, extra = {}) {
  return spawnClaude(session.claude, [], { cwd: process.cwd(), env: process.env, prompt: '', log: session.log, timeoutMs: 30000, ...extra });
}

test('isTransientProviderError matches provider error shapes only', () => {
  assert.equal(isTransientProviderError(TRANSIENT_TEXT), true);
  assert.equal(isTransientProviderError('{"type":"error","error":{"type":"overloaded_error"}}'), true);
  assert.equal(isTransientProviderError(FAILURES['error result event']), true);
  assert.equal(isTransientProviderError(SUCCESS), false);
  assert.equal(isTransientProviderError(JSON.stringify({ type: 'result', is_error: true, result: 'API Error: 400 invalid request' })), false);
  assert.equal(isTransientProviderError(`${TRANSIENT_TEXT}\n${SUCCESS}`), false);
  assert.equal(isTransientProviderError(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'see run-session.mjs:429' }] } })), false);
});

for (const [shape, failure] of Object.entries(FAILURES)) {
  test(`spawnClaude retries a transient error (${shape}) and returns the later success`, { timeout: 30000 }, async () => {
    process.env.EXO_PROVIDER_RETRY_MS = String(RETRY_MS);
    const session = stub(failure, 2);
    const started = Date.now();
    const result = await run(session);
    assert.equal(session.attempts(), 3);
    assert.match(result.text, /"result":"done"/);
    assert.ok(Date.now() - started >= RETRY_MS * 3, `timing-ok: backoff 100 then 200 ms; took ${Date.now() - started} ms`);
    assert.match(fs.readFileSync(session.log, 'utf8'), /rate_limit_error|429/);
  });
}

test('spawnClaude stops after three retries and returns the last failure', { timeout: 30000 }, async () => {
  process.env.EXO_PROVIDER_RETRY_MS = '10';
  const session = stub(TRANSIENT_TEXT, 99);
  const result = await run(session);
  assert.equal(session.attempts(), 4);
  assert.match(result.text, /429/);
});

test('spawnClaude does not retry a non-transient failure', { timeout: 30000 }, async () => {
  process.env.EXO_PROVIDER_RETRY_MS = '10';
  const session = stub(JSON.stringify({ type: 'result', is_error: true, result: 'API Error: 400 invalid request' }), 99);
  await run(session);
  assert.equal(session.attempts(), 1);
});

test('spawnClaude does not retry a timed-out session', { timeout: 30000 }, async () => {
  process.env.EXO_PROVIDER_RETRY_MS = '10';
  const script = `const fs = require('node:fs'); fs.appendFileSync(process.argv[1], 'x'); process.stdout.write(${JSON.stringify(TRANSIENT_TEXT)} + '\\n'); setTimeout(() => {}, 60000);`;
  const counter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-retry-')), 'count');
  const session = { claude: { command: process.execPath, prefix: ['-e', script, counter] }, log: path.join(path.dirname(counter), 'session.log') };
  const result = await run(session, { timeoutMs: 500 });
  assert.equal(result.timedOut, true);
  assert.equal(fs.readFileSync(counter, 'utf8'), 'x');
});
