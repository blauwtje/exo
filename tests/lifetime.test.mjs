import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const LIFETIME = fileURLToPath(new URL('../lib/lifetime.mjs', import.meta.url));

test('exits non-zero with one stderr line at the deadline', { timeout: 30000 }, () => {
  const source = `import { limitLifetime } from ${JSON.stringify(LIFETIME)}; limitLifetime('demo', 200); setInterval(() => {}, 1000);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', env: { ...process.env, EXO_DEMO_MS: '200' } });
  assert.equal(result.status, 124);
  assert.match(result.stderr, /^demo: deadline of 200 ms passed\n$/);
});

test('a finished script exits at once', { timeout: 30000 }, () => {
  const source = `import { limitLifetime } from ${JSON.stringify(LIFETIME)}; limitLifetime('demo', 600000);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0);
});

test('exits when its parent dies', { timeout: 30000 }, async () => {
  const child = `import { exitWithParent } from ${JSON.stringify(LIFETIME)}; exitWithParent('demo', 100); setInterval(() => {}, 1000); console.log(process.pid);`;
  const parent = `import { spawn } from 'node:child_process'; const c = spawn(process.execPath, ['--input-type=module', '-e', process.argv[1]], { stdio: ['ignore', 'inherit', 'inherit'] }); c.unref(); setTimeout(() => process.exit(0), 500);`;
  const holder = spawn(process.execPath, ['--input-type=module', '-e', parent, child], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  holder.stdout.on('data', (chunk) => { out += chunk; });
  await new Promise((resolve) => holder.on('exit', resolve));
  const pid = Number(out.trim());
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
