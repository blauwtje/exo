// The replies-* benchmark arms carry the reply rule text from the configure
// schema, so a cell measures each level as a session receives it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ARMS } from '../benchmarks/tasks.mjs';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../skills/configure/schema.json', import.meta.url), 'utf8'));

for (const level of ['tight', 'terse']) {
  test(`replies-${level} arm prompts with the ${level} rule from the schema`, () => {
    const arm = ARMS[`replies-${level}`];
    assert.equal(arm.prompt, SCHEMA.replies.rules[level]);
    assert.deepEqual(arm.pluginDirs, []);
  });
}
