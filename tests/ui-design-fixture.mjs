// Helpers the ui-design-*.test.mjs files share.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, run, script } from './harness.mjs';

export async function findingsFor(files) {
  const root = await fixture();
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(root, name), content);
  }
  const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout).static.findings;
}

export function ofType(findings, type) {
  return findings.filter((entry) => entry.type === type);
}
