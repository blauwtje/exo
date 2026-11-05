import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { captureChild } from '../benchmarks/capture-child.mjs';
import { tempDir } from './harness.mjs';

function fakeClaude(body) {
  const bin = tempDir('exo-capture-bin-');
  const script = path.join(bin, 'claude');
  fs.writeFileSync(script, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}

test('captureChild passes the arguments, closes stdin and returns the output', async () => {
  const env = fakeClaude('printf "%s|" "$@"; printf "stdin=%s|cwd=%s" "$(cat | wc -c | tr -d " ")" "$(pwd -P)"; echo oops >&2; exit 3');
  const cwd = fs.realpathSync(tempDir('exo-capture-cwd-'));
  const result = await captureChild({ command: 'claude', args: ['-p', 'two words'], cwd, env, timeoutMs: 10000 });
  assert.deepEqual(result, { stdout: `-p|two words|stdin=0|cwd=${cwd}`, stderr: 'oops\n', exitCode: 3, signal: null, timedOut: false });
});

test('captureChild kills a run past its timeout with the given signal', async () => {
  const env = fakeClaude('sleep 30');
  const killed = await captureChild({ command: 'claude', args: [], cwd: process.cwd(), env, timeoutMs: 100 });
  assert.equal(killed.timedOut, true);
  assert.equal(killed.signal, 'SIGKILL');
  assert.equal(killed.exitCode, null);
  const asked = await captureChild({ command: 'claude', args: [], cwd: process.cwd(), env, timeoutMs: 100, killSignal: 'SIGTERM' });
  assert.equal(asked.signal, 'SIGTERM');
});

test('captureChild passes only the given environment', async () => {
  const env = { ...fakeClaude('printf "%s" "$EXO_CAPTURE_PROBE"'), EXO_CAPTURE_PROBE: 'seen' };
  const result = await captureChild({ command: 'claude', args: [], cwd: process.cwd(), env, timeoutMs: 10000 });
  assert.equal(result.stdout, 'seen');
});
