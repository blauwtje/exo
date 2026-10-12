import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isCream, isNearBlack, isPurple, staticAudit } from '../skills/design-ui/scripts/check-ui.mjs';

test('color predicates keep their thresholds', () => {
  assert.equal(isPurple('#8b5cf6'), true);
  assert.equal(isPurple('#2563eb'), false);
  assert.equal(isNearBlack('#111111'), true);
  assert.equal(isNearBlack('#888888'), false);
  assert.equal(isCream('#faf3e0'), true);
  assert.equal(isCream('#ffffff'), false);
});

test('staticAudit ignores a tell inside a comment and keeps line numbers', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'check-ui-'));
  try {
    writeFileSync(path.join(directory, 'a.css'), '/* background: #8b5cf6; */\n/* more\n   text */\n:root { --brand: #8b5cf6; }\n');
    const findings = await staticAudit(directory);
    const commented = findings.filter((entry) => /^a\.css:[123]$/.test(entry.selector));
    assert.deepEqual(commented, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
