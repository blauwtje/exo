// `npm run check` fails on a Codex tree the sources no longer produce: a skill
// edited without regenerating, a stray generated file, an override whose
// source hash changed and a description over the Codex cap.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkCodexGenerated } from '../verify/checks/codex-generated.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const SKILL = 'skills/build/SKILL.md';
const GENERATED_SKILL = 'harnesses/codex/generated/skills/build/SKILL.md';

function copyOfRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-generated-check-'));
  for (const entry of ['agents', 'lib', 'harnesses', 'skills']) {
    fs.cpSync(path.join(ROOT, entry), path.join(root, entry), { recursive: true });
  }
  return root;
}

function run(root) {
  const results = [];
  const report = { result: (status, name, detail) => results.push({ status, name, detail }) };
  checkCodexGenerated(report, { root });
  return results;
}

const failures = (results) => results.filter((entry) => entry.status === 'FAIL');

test('a tree generated from the sources passes', () => {
  const root = copyOfRepository();
  assert.deepEqual(run(root).map((entry) => entry.status), ['PASS']);
});

test('a skill edited without regenerating fails', () => {
  const root = copyOfRepository();
  fs.appendFileSync(path.join(root, SKILL), '\nAn added sentence.\n');
  const found = failures(run(root));
  assert.equal(found.length, 1);
  assert.match(found[0].detail, new RegExp(`${GENERATED_SKILL} differs from the sources`));
});

test('a missing generated file fails', () => {
  const root = copyOfRepository();
  fs.rmSync(path.join(root, GENERATED_SKILL));
  const found = failures(run(root));
  assert.match(found[0].detail, new RegExp(`${GENERATED_SKILL} missing`));
});

test('a stray generated file fails', () => {
  const root = copyOfRepository();
  fs.writeFileSync(path.join(root, 'harnesses/codex/generated/skills/build/stray.md'), 'x\n');
  const found = failures(run(root));
  assert.match(found[0].detail, /stray\.md not generated from the sources/);
});

test('an override whose source hash changed fails', () => {
  const root = copyOfRepository();
  const override = path.join(root, 'harnesses/codex/overrides/skills/build/SKILL.md');
  fs.mkdirSync(path.dirname(override), { recursive: true });
  fs.writeFileSync(override, `<!-- exo:override source-sha256=${'0'.repeat(64)} -->\nreplaced\n`);
  const found = failures(run(root));
  assert.match(found[0].detail, /source hash changed/);
});

test('a description over 1024 characters fails', () => {
  const root = copyOfRepository();
  const location = path.join(root, SKILL);
  const text = fs.readFileSync(location, 'utf8').replace(/^description: .*$/m, `description: ${'a'.repeat(1100)}`);
  fs.writeFileSync(location, text);
  const found = failures(run(root));
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /description is 1100 characters, over 1024/);
});
