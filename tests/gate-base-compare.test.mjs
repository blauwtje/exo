import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { failingOnBase } from '../skills/gate/scripts/base-compare.mjs';

function repoWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'base-compare-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, name), body);
  const git = 'git -c user.name=t -c user.email=t@example.com';
  execSync(`git init -q && git add -A && ${git} commit -q -m base`, { cwd: root });
  return root;
}

test('reports only the specs that also fail on the base', async () => {
  const root = repoWith({
    'bad.test.mjs': "import test from 'node:test'; test('x', () => { throw new Error('no'); });",
    'good.test.mjs': "import test from 'node:test'; test('x', () => {});"
  });
  const failed = await failingOnBase({ root, base: 'HEAD', files: ['bad.test.mjs', 'good.test.mjs', 'new.test.mjs'], timeoutMs: 30000 });
  assert.deepEqual(failed, ['bad.test.mjs']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('returns nothing for no files', async () => {
  assert.deepEqual(await failingOnBase({ root: '.', base: 'HEAD', files: [], timeoutMs: 1000 }), []);
});
