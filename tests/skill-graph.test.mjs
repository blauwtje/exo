import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../verify/skill-graph.mjs', import.meta.url));
const run = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

for (const command of ['size', 'range', 'inbound', 'pins', 'refs', 'overlap']) {
  test(`${command} without its argument prints a usage line and exits non-zero`, () => {
    const result = run(command);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`^usage: skill-graph.mjs ${command} `));
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  });
}

test('an unknown command prints the usage line and exits non-zero', () => {
  const result = run('nope');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^usage: skill-graph.mjs /);
});

test('size with a skill prints its row', () => {
  const result = run('size', 'prompt');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /prompt/);
});
