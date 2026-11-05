import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkReadEstimates } from '../verify/checks/read-estimates.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function run(root) {
  const results = [];
  checkReadEstimates({ assert: (ok, name, pass, fail) => results.push({ ok, detail: ok ? pass : fail }) }, createRepository(root));
  return results[0];
}

function outcome(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-estimates-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return run(root);
}

const sizer = "import { fileTokens } from './read-estimate.mjs';\n";

test('the repository passes', () => {
  const result = run(ROOT);
  assert.equal(result.ok, true, result.detail);
});

test('the shared module may divide a size and look up the images directory', () => {
  assert.equal(outcome({ 'lib/worker-size.mjs': sizer, 'lib/read-estimate.mjs': "const a = stat.size / 4;\nconst d = 'images';\n" }).ok, true);
});

test('a hook that divides a file size into tokens fails and is named', () => {
  const result = outcome({ 'lib/worker-size.mjs': sizer, 'hooks/sizer.mjs': 'const tokens = fs.statSync(file).size / bytesPerToken;\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /hooks\/sizer\.mjs divides a file size into tokens/);
});

test('a lib file that looks up the session images directory fails and is named', () => {
  const result = outcome({ 'lib/worker-size.mjs': sizer, 'lib/other.mjs': "const dir = path.join(root, id, 'images');\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/other\.mjs resolves the session images directory/);
});

test('a worker sizer that stops importing the shared estimate fails', () => {
  const result = outcome({ 'lib/worker-size.mjs': 'export const x = 1;\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/worker-size\.mjs does not import/);
});
