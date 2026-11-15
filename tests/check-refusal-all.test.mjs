import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkRefusalAll } from '../verify/checks/refusal-all.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';


function scan(files) {
  const root = tempDir('refusal-all-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  const results = [];
  checkRefusalAll({ result: (status, name, detail) => results.push({ status, name, detail }) }, createRepository(root));
  return results;
}

test('a hook chaining denial rules with ?? is flagged', () => {
  const text = 'const fields = roleFields(input) ?? sizeFields(input, rewrite) ?? sliceFields(input);\n';
  const [{ status, detail }] = scan({ 'hooks/bad.mjs': text });
  assert.equal(status, 'FAIL');
  assert.match(detail, /^hooks\/bad\.mjs:1 chains denial rules with \?\?/);
});

test('a hook that gathers every violation passes', () => {
  const text = 'const reasons = [roleFields(input), sizeFields(input, rewrite)].filter(Boolean);\n';
  const [{ status }] = scan({ 'hooks/good.mjs': text });
  assert.equal(status, 'PASS');
});
