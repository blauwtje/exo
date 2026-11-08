import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the remember skill and its memory script are gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'skills/remember')), false);
  const skills = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.equal(skills.length, 10);
});

test('no memory setting is defined or offered', () => {
  assert.equal('memory' in JSON.parse(read('skills/configure/schema.json')), false);
  assert.equal(read('.claude-plugin/plugin.json').includes('"memory"'), false);
  assert.equal(read('skills/configure/scripts/settings.mjs').includes("'memory'"), false);
});

test('the session pointers name no project memory', () => {
  assert.equal(read('lib/session-pointers.mjs').includes('memory'), false);
});

test('the fold map marks remember deleted', () => {
  assert.equal(JSON.parse(read('verify/fold-map.json')).skills.remember.state, 'deleted');
});
