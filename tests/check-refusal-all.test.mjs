import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { firstViolationOnly } from '../verify/checks/refusal-all.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function scan(files) {
  const root = tempDir('refusal-all-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return firstViolationOnly(createRepository(root));
}

test('every shipped hook outside the pending list reports all violations', () => {
  assert.deepEqual(firstViolationOnly(createRepository(ROOT)), []);
});

test('a hook chaining denial rules with ?? is flagged', () => {
  const text = 'const fields = roleFields(input) ?? sizeFields(input, rewrite) ?? sliceFields(input);\n';
  const [finding] = scan({ 'hooks/bad.mjs': text });
  assert.match(finding, /^hooks\/bad\.mjs:1 chains denial rules with \?\?/);
});

test('a hook that gathers every violation passes', () => {
  const text = 'const reasons = [roleFields(input), sizeFields(input, rewrite)].filter(Boolean);\n';
  assert.deepEqual(scan({ 'hooks/good.mjs': text }), []);
});
