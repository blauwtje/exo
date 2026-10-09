// `npm run check` builds the Codex tree in memory and fails on an override
// whose source hash changed and on a description over the Codex cap.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkCodexOverrides } from '../verify/checks/codex-overrides.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const SKILL = 'skills/build/SKILL.md';

function copyOfRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-overrides-check-'));
  for (const entry of ['agents', 'lib', 'harnesses', 'skills']) {
    fs.cpSync(path.join(ROOT, entry), path.join(root, entry), { recursive: true });
  }
  return root;
}

function run(root) {
  const results = [];
  const report = { result: (status, name, detail) => results.push({ status, name, detail }) };
  checkCodexOverrides(report, { root });
  return results;
}

const failures = (results) => results.filter((entry) => entry.status === 'FAIL');

test('the sources pass', () => {
  assert.deepEqual(run(copyOfRepository()).map((entry) => entry.status), ['PASS']);
});

test('a skill edited with no generated tree on disk still passes', () => {
  const root = copyOfRepository();
  fs.rmSync(path.join(root, 'harnesses/codex/generated'), { recursive: true, force: true });
  fs.appendFileSync(path.join(root, SKILL), '\nAn added sentence.\n');
  assert.deepEqual(run(root).map((entry) => entry.status), ['PASS']);
});

test('an override whose source hash changed fails', () => {
  const root = copyOfRepository();
  const override = path.join(root, 'harnesses/codex/overrides/skills/build/SKILL.md');
  fs.mkdirSync(path.dirname(override), { recursive: true });
  fs.writeFileSync(override, `<!-- exo:override source-sha256=${'0'.repeat(64)} -->\nreplaced\n`);
  const found = failures(run(root));
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /overrides\/skills\/build\/SKILL\.md source hash changed/);
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
