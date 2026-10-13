import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { REGISTRY_DOMAINS, sandboxMode, sandboxSettings } from '../skills/build/scripts/run-session.mjs';

const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const mode = { enabled: true, allowedDomains: [] };

test('sandbox: the registry list is allowed by default and run.json domains are added without duplicates', () => {
  const merged = sandboxMode({ defaults: { sandbox: { allowedDomains: ['pypi.org', 'example.com'] } } }, { platform: 'linux' });
  assert.deepEqual(merged.allowedDomains, [...REGISTRY_DOMAINS, 'example.com']);
  assert.deepEqual(sandboxSettings(merged).sandbox.network.allowedDomains, merged.allowedDomains);
  assert.deepEqual(sandboxMode({}, { platform: 'linux' }).allowedDomains, REGISTRY_DOMAINS);
});

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
