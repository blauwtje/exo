import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'skills/spec/scripts/verdict-check.mjs');
const examplePlan = path.join(root, 'skills/spec/references/example-plan.md');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-'));

function check(brief) {
  const file = path.join(workDir, `brief-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(file, brief);
  return spawnSync(process.execPath, [script, '--plan', file], { encoding: 'utf8' });
}

const OBJECTION = 'Objection: the existing exporter already covers this, so the work may duplicate it.';

test('a brief with Verdict: go and an Objection passes', () => {
  const result = check(`## Goal\nX.\n\n## Verdict\nVerdict: go\n${OBJECTION}\n\n## Tasks\n`);
  assert.equal(result.status, 0, result.stdout);
});

test('a brief with no Verdict section fails', () => {
  const result = check('## Goal\nX.\n\n## Tasks\n');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no '## Verdict' section/);
});

test('a Verdict section without an Objection fails', () => {
  const result = check('## Goal\nX.\n\n## Verdict\nVerdict: go\n');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no 'Objection:' line/);
});

test('a one-word Objection fails', () => {
  const result = check('## Verdict\nVerdict: go\nObjection: none\n');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /names no concrete reason/);
});

test('a stop or clarify verdict does not belong in a brief', () => {
  for (const verdict of ['stop', 'clarify']) {
    const result = check(`## Verdict\nVerdict: ${verdict}\n${OBJECTION}\n`);
    assert.equal(result.status, 1, verdict);
    assert.match(result.stdout, new RegExp(`Verdict: ${verdict}`));
  }
});

test('a Verdict line outside the section does not count', () => {
  const result = check(`## Goal\nVerdict: go\n${OBJECTION}\n\n## Verdict\nnothing\n`);
  assert.equal(result.status, 1);
});

test('the example plan carries the two lines and spec runs the check', () => {
  assert.equal(spawnSync(process.execPath, [script, '--plan', examplePlan], { encoding: 'utf8' }).status, 0);
  const skill = fs.readFileSync(path.join(root, 'skills/spec/SKILL.md'), 'utf8');
  const reference = fs.readFileSync(path.join(root, 'skills/spec/references/verdict.md'), 'utf8');
  assert.match(skill, /references\/verdict\.md/);
  assert.match(reference, /verdict-check\.mjs/);
  assert.match(reference, /`clarify` asks/);
  assert.match(reference, /`stop` writes no brief/);
});
