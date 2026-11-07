import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownerRows, OWNER_ROWS_FILE } from '../verify/checks/reference-tables.mjs';

test('owner rows load from the data file', () => {
  assert.equal(OWNER_ROWS_FILE, 'verify/reference-owner-rows.txt');
  assert.ok(fs.existsSync(OWNER_ROWS_FILE));
  const rows = ownerRows();
  assert.ok(rows['skills/build/SKILL.md'].includes('references/run-loop.md'));
  assert.deepEqual(rows['skills/check-docs/SKILL.md'], []);
});

test('the check source holds no per-skill registry', () => {
  const source = fs.readFileSync('verify/checks/reference-tables.mjs', 'utf8');
  assert.doesNotMatch(source, /'references\/run-loop\.md'/);
});
