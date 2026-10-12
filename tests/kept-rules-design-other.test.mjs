import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const scripts = {
  inspectStyles: new URL('../skills/design-ui/scripts/inspect-styles.mjs', import.meta.url).pathname,
  context: new URL('../skills/design-ui/scripts/context.mjs', import.meta.url).pathname,
  checkpoint: new URL('../skills/design-ui/scripts/checkpoint.mjs', import.meta.url).pathname,
  picks: new URL('../skills/design-ui/scripts/picks.mjs', import.meta.url).pathname,
  reference: new URL('../skills/design-ui/scripts/reference.mjs', import.meta.url).pathname
};

function help(script) {
  return spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
}

test('inspect-styles --help prints its usage and exits 0', () => {
  const run = help(scripts.inspectStyles);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--url <url> \[--viewport <width>x<height>\]/);
});

test('context --help prints its usage and exits 0', () => {
  const run = help(scripts.context);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--surface <name> --needs/);
  assert.match(run.stdout, /--status/);
  assert.match(run.stdout, /--init/);
});

test('checkpoint --help prints its usage and exits 0', () => {
  const run = help(scripts.checkpoint);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--run <dir> --stage baseline\|post-build\|final/);
});

test('picks --help prints its usage and exits 0', () => {
  const run = help(scripts.picks);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--project <root> --display <family> --body <family> --accent <color>/);
});

test('reference --help prints its usage and exits 0', () => {
  const run = help(scripts.reference);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--set <name>/);
  assert.match(run.stdout, /--display-font <font>/);
});
