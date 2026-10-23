import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));

async function brief({ land, open = [] }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'next-stage-'));
  const file = path.join(directory, 'brief.md');
  const lines = ['# Brief', '', '## Goal', 'A goal.', '', '## Plan basis', 'Repository: /repo', 'Branch: b', ...(land === null ? [] : [`Land: ${land}`]), ''];
  if (open.length > 0) lines.push('## Open points', ...open.map((entry) => `- ${entry}`), '');
  await fs.writeFile(file, lines.join('\n'));
  return file;
}

function nextStage(...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('after spec the report asks one free-text start-or-change question and names how the work lands', async () => {
  const landings = [
    ['local', 'lands on this machine'],
    [null, 'lands on this machine'],
    ['push-main', 'pushes to main'],
    ['pr', 'opens a pull request']
  ];
  for (const [land, text] of landings) {
    const out = nextStage('--after', 'spec', '--artifact', await brief({ land }));
    assert.match(out, new RegExp(`^\\*\\*Start the build now, or change the brief first\\?\\*\\* It .*${text}\\.$`, 'm'));
    assert.match(out, /^Reply `ok` to start, or say what to change\.$/m);
    assert.doesNotMatch(out, /\(A\)|Recommended|\/clear|\/model|\/effort|Unattended/);
    assert.equal(out.trimEnd().split('\n').length, 2);
  }
});

test('after spec a brief with open points prints the open points, not the start question', async () => {
  const out = nextStage('--after', 'spec', '--artifact', await brief({ land: 'local', open: ['Which store?'] }));
  assert.match(out, /has 1 open point/);
  assert.match(out, /- Which store\?/);
  assert.doesNotMatch(out, /Start the build now/);
});

test('after find-cause the question stays as it was', () => {
  const out = nextStage('--after', 'find-cause', '--artifact', 'unused');
  assert.match(out, /^\*\*Should I build the fix\?\*\*$/m);
  assert.match(out, /\(A\) Build\*\*: build the fix now/);
});

test('after build the report is one free-text change line, no options', () => {
  const out = nextStage('--after', 'build', '--artifact', 'unused');
  assert.equal(out.trimEnd().split('\n').length, 1);
  assert.match(out, /^Reply with what to change/);
  assert.doesNotMatch(out, /\(A\)|Recommended|\/clear/);
});

test('--fresh is refused', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--after', 'spec', '--artifact', 'x', '--fresh'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});
