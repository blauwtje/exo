import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'learn', 'SKILL.md');

test('Mine step 1 runs candidates --texts and describes the other session line', () => {
  const text = fs.readFileSync(skill, 'utf8');
  const step = text.split('\n').find((line) => line.startsWith('1. Run') && line.includes('corrections.mjs'));
  assert.match(step, /candidates --texts/);
  assert.match(step, /other session:/);
});
