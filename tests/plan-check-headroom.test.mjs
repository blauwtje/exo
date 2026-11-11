import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { compactPlanFixture, compactTask, gitRepository } from './harness.mjs';

const VERIFY = ['budgets.mjs', 'body-size.mjs', 'markdown.mjs', 'repository.mjs'];
const verifyFiles = (edit = (text) => text) => Object.fromEntries(VERIFY.map((name) => [`verify/${name}`, edit(fs.readFileSync(new URL(`../verify/${name}`, import.meta.url), 'utf8'))]));

const BUILD_CAP = Number(/'build': (\d+)/.exec(verifyFiles()['verify/budgets.mjs'])[1]);
const NEAR_CAP = BUILD_CAP * 4 - 20;
const AT_THRESHOLD = BUILD_CAP * 4 - 201;

const skill = (bytes) => `---\nname: x\ndescription: x\n---\n${'x'.repeat(bytes)}\n`;

async function warningsFor(files, withBudgets = true) {
  const root = await gitRepository({ ...(withBudgets ? verifyFiles() : {}), ...files });
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'Edit build', files: ['skills/build/SKILL.md'] }),
    compactTask({ number: 2, title: 'Edit roomy', files: ['skills/roomy/SKILL.md'], dependsOn: '1' })
  ] });
  return planCheckReport(plan, { root }).lines.filter((line) => line.startsWith('[WARN] Task') && line.includes('headroom'));
}

test('a task editing a skill within the headroom threshold of its cap draws a warning', async () => {
  const warnings = await warningsFor({ 'skills/build/SKILL.md': skill(NEAR_CAP), 'skills/roomy/SKILL.md': skill(40) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Task 1 edits skills\/build\/SKILL\.md/);
});

test('a root without verify/budgets.mjs draws no headroom warning', async () => {
  const warnings = await warningsFor({ 'skills/build/SKILL.md': skill(NEAR_CAP) }, false);
  assert.deepEqual(warnings, []);
});

test('a skill with exactly the threshold of headroom draws no warning', async () => {
  const warnings = await warningsFor({ 'skills/build/SKILL.md': skill(AT_THRESHOLD), 'skills/roomy/SKILL.md': skill(40) });
  assert.deepEqual(warnings, []);
});

test('a task listing a references file of the same skill draws no warning', async () => {
  const root = await gitRepository({ ...verifyFiles(), 'skills/build/SKILL.md': skill(NEAR_CAP), 'skills/build/references/a.md': 'a\n' });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Edit build', files: ['skills/build/references/a.md', 'skills/build/SKILL.md'] })] });
  assert.deepEqual(planCheckReport(plan, { root }).lines.filter((line) => line.includes('headroom')), []);
});

test('an earlier task listing a references file of the same skill also clears the warning', async () => {
  const root = await gitRepository({ ...verifyFiles(), 'skills/build/SKILL.md': skill(NEAR_CAP), 'skills/build/references/a.md': 'a\n' });
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'Add reference', files: ['skills/build/references/a.md'] }),
    compactTask({ number: 2, title: 'Edit build', files: ['skills/build/SKILL.md'], dependsOn: '1' })
  ] });
  assert.deepEqual(planCheckReport(plan, { root }).lines.filter((line) => line.includes('headroom')), []);
});

test('the caps come from the target root, not the plugin', async () => {
  const root = await gitRepository({ ...verifyFiles((text) => text.replace(`'build': ${BUILD_CAP}`, `'build': ${BUILD_CAP + 250}`)), 'skills/build/SKILL.md': skill(NEAR_CAP) });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Edit build', files: ['skills/build/SKILL.md'] })] });
  assert.deepEqual(planCheckReport(plan, { root }).lines.filter((line) => line.includes('headroom')), []);
});

test('EXO_BODY_SIZE_TIMEOUT_MS bounds the body-size child and a timeout skips the headroom check', async () => {
  const root = await gitRepository({ ...verifyFiles(), 'skills/build/SKILL.md': skill(NEAR_CAP) });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Edit build', files: ['skills/build/SKILL.md'] })] });
  const before = process.env.EXO_BODY_SIZE_TIMEOUT_MS;
  process.env.EXO_BODY_SIZE_TIMEOUT_MS = '1';
  try {
    const lines = planCheckReport(plan, { root }).lines.filter((line) => line.includes('headroom'));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[WARN\] headroom check skipped, the root's verify\/body-size\.mjs failed: .*ETIMEDOUT/);
  } finally {
    if (before === undefined) delete process.env.EXO_BODY_SIZE_TIMEOUT_MS;
    else process.env.EXO_BODY_SIZE_TIMEOUT_MS = before;
  }
});

const SIZE_LIMIT_BYTES = 15_000 * 4;

const changelog = (history) => `# Changelog\n\n## Unreleased\n\n### Changed\n\n- a line\n\n## 0.1.0\n\n### Changed\n\n${'x'.repeat(history)}\n`;

async function flaggedForSize(file, data) {
  const root = await gitRepository({ 'CHANGELOG.md': file });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Record', files: ['CHANGELOG.md'], data })] });
  return planCheckReport(plan, { root }).lines.some((line) => /^\[WARN\] Task 1: split Task 1 \(about \d+ tokens/.test(line));
}

async function flaggedForFiles(contents, listed) {
  const root = await gitRepository(contents);
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Edit', files: listed })] });
  return planCheckReport(plan, { root }).lines.some((line) => /^\[WARN\] Task 1: split Task 1 \(about \d+ tokens/.test(line));
}

test('a Files entry that names another Files entry counts only by its matching lines', async () => {
  const reference = `see src/a.mjs\n${'x'.repeat(SIZE_LIMIT_BYTES)}\n`;
  assert.equal(await flaggedForFiles({ 'src/a.mjs': 'a\n', 'docs/big.md': reference }, ['src/a.mjs', 'docs/big.md']), false);
});

test('a large Files entry that names no other Files entry counts whole', async () => {
  const unrelated = `${'x'.repeat(SIZE_LIMIT_BYTES)}\n`;
  assert.equal(await flaggedForFiles({ 'src/a.mjs': 'a\n', 'docs/big.md': unrelated }, ['src/a.mjs', 'docs/big.md']), true);
});

test('a task naming one heading of a markdown file is sized by that heading section, not the whole file', async () => {
  assert.equal(await flaggedForSize(changelog(SIZE_LIMIT_BYTES), 'one `## Unreleased` `### Changed` line'), false);
});

test('a task naming no heading of a markdown file is sized by the whole file', async () => {
  assert.equal(await flaggedForSize(changelog(SIZE_LIMIT_BYTES), 'one new line'), true);
});

test('a task naming a heading the file lacks is sized by the whole file', async () => {
  assert.equal(await flaggedForSize(changelog(SIZE_LIMIT_BYTES), 'one `## Missing` line'), true);
});

test('a task naming a heading and one outside its section is sized by the whole file', async () => {
  assert.equal(await flaggedForSize(changelog(SIZE_LIMIT_BYTES), 'a `## Unreleased` line and a `## 0.1.0` line'), true);
});

test('a generated Files entry adds nothing to the task size', async () => {
  const snapshot = `﻿// <auto-generated />\n${'x'.repeat(SIZE_LIMIT_BYTES)}\n`;
  assert.equal(await flaggedForFiles({ 'src/a.mjs': 'a\n', 'src/Migrations/AppSnapshot.cs': snapshot }, ['src/a.mjs', 'src/Migrations/AppSnapshot.cs']), false);
});
