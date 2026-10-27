import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ARMS, BREVITY_LINES, DEFAULT_ARMS } from '../benchmarks/tasks.mjs';

const STYLE = fs.readFileSync(new URL('../output-styles/adhd.md', import.meta.url), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
const squash = (text) => text.replace(/\s+/g, ' ');

test('every brevity sentence is one exact sentence of the adhd style', () => {
  assert.ok(Object.keys(BREVITY_LINES).length > 0);
  for (const [slug, sentence] of Object.entries(BREVITY_LINES)) {
    assert.equal(STYLE.split(sentence).length, 2, `${slug} appears once in the style`);
  }
});

test('each adhd-no arm is the adhd-style prompt minus its one sentence', () => {
  for (const [slug, sentence] of Object.entries(BREVITY_LINES)) {
    const arm = ARMS[`adhd-no-${slug}`];
    assert.equal(arm.ablate, slug);
    assert.equal(arm.prompt.includes(sentence), false, `${slug} drops its sentence`);
    assert.equal(squash(arm.prompt), squash(STYLE.replace(sentence, '')), `${slug} keeps the rest`);
    assert.deepEqual([arm.pluginDirs, arm.promptSuffix], [[], null]);
  }
});

test('the arms with ablate are exactly the adhd-no arms and stay out of the default list', () => {
  const ablated = Object.keys(ARMS).filter((name) => ARMS[name].ablate !== undefined);
  assert.deepEqual(ablated, Object.keys(BREVITY_LINES).map((slug) => `adhd-no-${slug}`));
  assert.equal(DEFAULT_ARMS.some((name) => ablated.includes(name)), false);
  assert.equal(DEFAULT_ARMS.includes('adhd-style'), true);
});
