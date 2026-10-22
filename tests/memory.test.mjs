// A memory line counts as live unless it carries a value for superseded, dropped or retired;
// a line written before the `retired` field existed has no such key and stays live.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const MEMORY = fileURLToPath(new URL('../skills/remember/scripts/memory.mjs', import.meta.url));

async function render(lines) {
  const repository = await fixture();
  execFileSync('git', ['init', '-q', repository]);
  fs.mkdirSync(path.join(repository, '.git', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(repository, '.git', 'exo', 'memory.json'), JSON.stringify({ candidates: {}, lines, rejected: {} }));
  const result = await run(MEMORY, ['render', '--cwd', repository]);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

const line = (claim, extra) => ({ claim, refs: ['tests/harness.mjs'], written: '2026-09-19', superseded: null, dropped: null, ...extra });

test('a line without the retired key is live', async () => {
  const output = await render([line('Shared helpers live in harness.')]);
  assert.match(output, /- Shared helpers live in harness\. \(refs: tests\/harness\.mjs\)/);
});

test('a line with a retired value is not live', async () => {
  const output = await render([line('Old lesson.', { retired: '2026-10-01' })]);
  assert.doesNotMatch(output, /Old lesson/);
});

test('a line with retired null is live', async () => {
  const output = await render([line('Current lesson.', { retired: null })]);
  assert.match(output, /Current lesson\./);
});
