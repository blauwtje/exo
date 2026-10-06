import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

function cli(file, ...args) {
  const result = spawnSync(process.execPath, [CLI, '--file', file, '--now', '2026-03-01T10:00:00.000Z', ...args], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

test('add, list, done and rm through the command line', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'taskbook-')), 'data.json');
  assert.equal(cli(file, 'add', 'write', 'report', '--tags', 'work').out, 'added #1\n');
  cli(file, 'add', 'buy milk');
  assert.equal(cli(file, 'list').out, '#1 [ ] write report (work)\n#2 [ ] buy milk\n');
  cli(file, 'done', '1');
  assert.equal(cli(file, 'list', '--status', 'done').out, '#1 [x] write report (work)\n');
  assert.equal(cli(file, 'rm', '2').out, 'deleted #2\n');
  assert.equal(cli(file, 'list').out, '#1 [x] write report (work)\n');
});

test('an unknown id is an error and exits 1', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'taskbook-')), 'data.json');
  const result = cli(file, 'rm', '7');
  assert.equal(result.status, 1);
  assert.match(result.err, /no task #7/);
});
