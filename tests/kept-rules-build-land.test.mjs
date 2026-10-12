import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = ['land-task', 'next-task', 'remove-worktree'];

function run(name, args) {
  const script = fileURLToPath(new URL(`../skills/build/scripts/${name}.mjs`, import.meta.url));
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

for (const name of SCRIPTS) {
  test(`${name}: an unknown flag is refused with exit 2`, () => {
    const { status, stderr } = run(name, ['--bogus']);
    assert.equal(status, 2);
    assert.ok(stderr.includes(`unknown flag '--bogus'`));
  });
}
