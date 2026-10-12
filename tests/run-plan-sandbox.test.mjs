import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sandboxSettings } from '../skills/build/scripts/run-plan.mjs';

const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const mode = { enabled: true, allowedDomains: [] };

test('sandbox: each unsandboxed script is excluded with and without arguments', () => {
  const landTask = path.join(PLUGIN_ROOT, 'skills', 'build', 'scripts', 'land-task.mjs');
  const verify = path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs');
  const task = sandboxSettings(mode).sandbox.excludedCommands;
  const tail = sandboxSettings(mode, { tail: true }).sandbox.excludedCommands;
  for (const command of [`node "${landTask}"`, `node ${landTask}`, `node "${landTask}":*`, `node ${landTask}:*`]) {
    assert.ok(task.includes(command), command);
    assert.ok(tail.includes(command), command);
  }
  for (const command of [`node "${verify}"`, `node ${verify}`, `node "${verify}":*`, `node ${verify}:*`]) {
    assert.ok(!task.includes(command), command);
    assert.ok(tail.includes(command), command);
  }
});
