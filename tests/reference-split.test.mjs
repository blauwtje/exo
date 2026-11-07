import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkReferenceSplit } from '../verify/checks/reference-split.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const MOVED = 'This long line of moved guidance belongs to exactly one place only.';

function run(skillText, references) {
  const root = tempDir('reference-split-');
  const folder = path.join(root, 'skills', 'prompt');
  fs.mkdirSync(path.join(folder, 'references'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'SKILL.md'), skillText);
  for (const [name, text] of Object.entries(references)) {
    fs.writeFileSync(path.join(folder, 'references', name), text);
  }
  const results = [];
  checkReferenceSplit({ assert: (ok, name, pass, fail) => results.push({ ok, detail: ok ? pass : fail }) }, createRepository(root));
  return results[0];
}

test('a pointer to an existing, named reference passes', () => {
  const result = run('Format -> read references/format.md\n', { 'format.md': `${MOVED}\n` });
  assert.equal(result.ok, true);
});

test('a pointer to a missing file fails', () => {
  const result = run('Format -> read references/format.md\n', {});
  assert.equal(result.ok, false);
  assert.match(result.detail, /prompt: 'references\/format\.md' does not exist/);
});

test('a reference the SKILL.md never names fails', () => {
  const result = run('Nothing here.\n', { 'format.md': `${MOVED}\n` });
  assert.equal(result.ok, false);
  assert.match(result.detail, /prompt: references\/format\.md is not named in SKILL\.md/);
});

test('a line kept in both SKILL.md and a reference fails', () => {
  const result = run(`Format -> read references/format.md\n${MOVED}\n`, { 'format.md': `${MOVED}\n` });
  assert.equal(result.ok, false);
  assert.match(result.detail, /prompt: references\/format\.md repeats a SKILL\.md line/);
});
