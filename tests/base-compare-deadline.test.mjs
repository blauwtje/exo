import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { KILL_GRACE_MS } from '../lib/bounded-command.mjs';
import { failingOnBase } from '../skills/gate/scripts/base-compare.mjs';
import { gitRepository } from './harness.mjs';

const HANGING_SPEC = "import test from 'node:test'; test('x', () => new Promise(() => setInterval(() => {}, 1000)));";
const FILES = ['a.test.mjs', 'b.test.mjs', 'c.test.mjs', 'd.test.mjs', 'e.test.mjs'];

test('hanging base specs share one total deadline and do not count as failing on base', async () => {
  const root = await gitRepository(Object.fromEntries(FILES.map((file) => [file, HANGING_SPEC])));
  const timeoutMs = 1500;
  const started = Date.now();
  const failed = await failingOnBase({ root, base: 'HEAD', files: FILES, timeoutMs });
  assert.ok(Date.now() - started < timeoutMs + KILL_GRACE_MS, `${Date.now() - started} ms`);
  assert.deepEqual(failed, []);
  fs.rmSync(root, { recursive: true, force: true });
});
