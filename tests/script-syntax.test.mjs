// The syntax check never enters a dot-prefixed folder: `.git/objects` loses folders while a
// detached `git maintenance run --auto` repacks, and a folder gone mid-walk crashed the verifier.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRepository } from '../verify/repository.mjs';
import { checkScriptSyntax } from '../verify/checks/script-syntax.mjs';

test('the syntax check parses scripts outside dot folders and never enters one', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'script-syntax-'));
  const locked = path.join(root, '.git', 'objects', '4d');
  t.after(() => {
    fs.chmodSync(locked, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'good.mjs'), 'export const one = 1;\n');
  fs.mkdirSync(path.join(root, '.cache'));
  fs.writeFileSync(path.join(root, '.cache', 'broken.mjs'), 'export const = ;\n');
  // Reading this folder fails as a removed one would.
  fs.mkdirSync(locked, { recursive: true });
  fs.chmodSync(locked, 0);

  const results = [];
  const report = { assert: (condition, name, pass, fail) => results.push({ condition, name, detail: condition ? pass : fail }) };
  checkScriptSyntax(report, createRepository(root));
  assert.deepEqual(results, [{ condition: true, name: 'javascript syntax', detail: 'every JavaScript module parses' }]);
});
