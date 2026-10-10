import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const run = (...flags) => spawnSync('node', [path.join(root, 'verify.mjs'), ...flags], { cwd: root, encoding: 'utf8', timeout: 300000 });

test('--static prints no line for the suite, the plugin version or the self-test, and still runs the other checks', () => {
  const out = run('--static').stdout;
  for (const name of ['skill script behavior', 'plugin version', 'verifier self-test']) {
    assert.ok(!out.includes(name), `${name} printed under --static`);
  }
  assert.match(out, /YAML frontmatter/);
  assert.match(out, /^SUMMARY /m);
});

test('package.json carries the validate:static script', async () => {
  const { default: pkg } = await import('../package.json', { with: { type: 'json' } });
  assert.equal(pkg.scripts['validate:static'], 'node verify.mjs --static');
});
