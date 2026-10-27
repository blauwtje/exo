import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnClaude } from '../skills/build/scripts/run-session.mjs';

// why: a child that exits while a grandchild holds stdout never fires 'close', so the run waited forever.
test('spawnClaude settles within the exit grace when a grandchild holds stdout', { timeout: 20000 }, async () => {
  const script = "require('node:child_process').spawn('sleep', ['30'], { stdio: ['ignore', 'inherit', 'inherit'] }).unref(); process.stdout.write('done\\n');";
  const started = Date.now();
  const result = await spawnClaude(
    { command: process.execPath, prefix: ['-e', script] },
    [],
    { cwd: process.cwd(), env: process.env, prompt: '', log: path.join(os.tmpdir(), `exo-exit-${process.pid}.log`), timeoutMs: 60000 }
  );
  assert.equal(result.timedOut, false);
  assert.match(result.text, /done/);
  assert.ok(Date.now() - started < 9000, `timing-ok: hang guard, the grandchild holds stdout for 30 s; settled after ${Date.now() - started} ms`);
});
