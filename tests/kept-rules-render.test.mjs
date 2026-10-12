import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const scripts = {
  inspect: new URL('../skills/design-ui/scripts/inspect-render.mjs', import.meta.url).pathname,
  direction: new URL('../skills/design-ui/scripts/direction.mjs', import.meta.url).pathname,
  sketchTab: new URL('../skills/design-ui/scripts/sketch-tab.mjs', import.meta.url).pathname
};

function help(script) {
  return spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
}

test('inspect-render --help prints its usage and exits 0', () => {
  const run = help(scripts.inspect);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--image <png>/);
  assert.match(run.stdout, /--max-quiet-regions <n>/);
});

test('direction --help prints its usage and exits 0', () => {
  const run = help(scripts.direction);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--plan --seed <token> --space <file>/);
  assert.match(run.stdout, /--select --contracts <file> --index <n>/);
});

test('sketch-tab --help prints its usage and exits 0', () => {
  const run = help(scripts.sketchTab);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--serve <dir>/);
  assert.match(run.stdout, /--wait <dir> --sketch <file\.html>/);
});
