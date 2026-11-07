import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOverview, countWord, OVERVIEW_PATH, readSkills, skillFromLines, userOnlyClaimProblems } from '../lib/skill-overview.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const skills = readSkills(`${root}skills`);
const read = (relative) => readFileSync(`${root}${relative}`, 'utf8');

test('the committed cheat sheet equals the one generated from the frontmatter', () => {
  assert.equal(read(OVERVIEW_PATH), buildOverview(skills));
});

test('every skill but route-skills has a row, so a new skill needs no hand edit', () => {
  const sheet = read(OVERVIEW_PATH);
  for (const skill of skills.filter((entry) => entry.name !== 'route-skills')) {
    assert.match(sheet, new RegExp(`^\\| \`${skill.name}\` \\|`, 'm'), skill.name);
  }
});

test('a user-only skill shows its command and a model-invocable one shows Just ask', () => {
  const rows = buildOverview([
    skillFromLines(['---', 'name: aa', 'description: Use when x. Not for y.', 'disable-model-invocation: true', 'argument-hint: "[goal]"', '---', 'Body.']),
    skillFromLines(['---', 'name: bb', 'description: Use when x. Not for y.', '---', 'Body.']),
  ]);
  assert.match(rows, /\| `aa` \| Type `\/exo:aa \[goal\]` \|/);
  assert.match(rows, /\| `bb` \| Just ask \|/);
});

test('the generated sheet stays within the 750 token reference ceiling', () => {
  assert.ok(Math.round(Buffer.byteLength(buildOverview(skills)) / 4) <= 750);
});

test('CONTRIBUTING states the user-only count and names every flagged skill', () => {
  assert.deepEqual(userOnlyClaimProblems(read('CONTRIBUTING.md'), skills), []);
});

test('the claim check reports a wrong count and a missing name', () => {
  const flagged = skills.filter((skill) => skill.userOnly);
  const stale = `${countWord(flagged.length - 1)} skills carry \`disable-model-invocation: true\`: \`${flagged[0].name}\``;
  const problems = userOnlyClaimProblems(stale, skills);
  assert.equal(problems.length, 2);
});
