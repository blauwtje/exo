import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

function script(relative) {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

function run(relative, args) {
  return spawnSync(process.execPath, [script(relative), ...args], { encoding: 'utf8' });
}

const HELP_CASES = [
  ['skills/build/scripts/land-run.mjs', '--started-at <ISO time>'],
  ['skills/build/scripts/start-run.mjs', '--find-only'],
  ['skills/build/scripts/wait-report.mjs', '--since <epoch seconds>'],
  ['skills/configure/scripts/settings.mjs', 'node settings.mjs set <key> <value> --scope project|local'],
  ['skills/file-issues/scripts/repo-fields.mjs', '--size --paths <n> --criteria <n> --shape spec|report'],
  ['skills/remember/scripts/memory.mjs', 'node memory.mjs reject --session <id>'],
  ['skills/route-skills/scripts/next-stage.mjs', '--after <stage> --artifact <path> [--fresh]'],
  ['skills/save-session/scripts/handoff.mjs', 'node handoff.mjs path [--cwd <dir>]'],
];

for (const [relative, expected] of HELP_CASES) {
  test(`${relative}: --help prints the usage and exits 0`, () => {
    const { status, stdout } = run(relative, ['--help']);
    assert.equal(status, 0);
    assert.ok(stdout.includes(expected));
  });
}

test('land-run: --help names the exit codes', () => {
  const { stdout } = run('skills/build/scripts/land-run.mjs', ['--help']);
  assert.ok(stdout.includes('exit 0 landed, 3 parked, 2 bad argument'));
});

test('repo-fields: a usage error exits 2 and prints nothing to stdout', () => {
  const { status, stdout } = run('skills/file-issues/scripts/repo-fields.mjs', ['--bogus']);
  assert.equal(status, 2);
  assert.equal(stdout, '');
});

test('wait-report: a missing --since is a usage error', () => {
  const { status } = run('skills/build/scripts/wait-report.mjs', ['--report', 'x.md']);
  assert.equal(status, 1);
});
