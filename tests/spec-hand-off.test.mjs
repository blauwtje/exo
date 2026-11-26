import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const text = readFileSync(new URL('../skills/spec/SKILL.md', import.meta.url), 'utf8');

test('spec hands the brief to a fresh build session', () => {
  assert.match(text, /one code block holding a paste-ready prompt that runs `exo:build`/);
  assert.match(text, /Sonnet 5\.5, medium/);
  assert.doesNotMatch(text, /On `ok`, invoke `exo:build`/);
});
