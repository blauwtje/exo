import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';
import { generateTree } from '../harnesses/codex/generate.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const COPIED = ['lib', 'skills', 'agents', 'harnesses', '.claude-plugin', 'package.json'];

test('the Codex tree skips a run-state .exo folder inside a skill folder', () => {
  const copy = tempDir('exo-codex-');
  for (const entry of COPIED) {
    if (fs.existsSync(path.join(ROOT, entry))) fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true, filter: (source) => path.basename(source) !== '.exo' });
  }
  const debris = path.join(copy, 'skills', 'research', '.exo');
  fs.mkdirSync(debris, { recursive: true });
  fs.writeFileSync(path.join(debris, 'long-command-test.sh'), 'echo hi');
  const files = [...generateTree(copy).keys()];
  assert.equal(files.some((file) => file.includes('/.exo/')), false);
});
