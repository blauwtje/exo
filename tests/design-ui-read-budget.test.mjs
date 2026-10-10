// The design-ui lead reads SKILL.md whole plus named reference sections before
// its first preview (rung 3) and on the one pass. This pins both read sets to a
// byte budget, so a growing section shows up here rather than as a slower run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../skills/design-ui/${relative}`, import.meta.url), 'utf8');

const PREVIEW_LIMIT = 30000;
const ONE_PASS_LIMIT = 46000;

const PREVIEW = [
  ['intake.md', '## Asking'],
  ['intake.md', '## The direction offer'],
  ['intake.md', '## The run directory'],
  ['intake.md', '## Settled identity'],
  ['phase-detail.md', '## Context'],
  ['phase-detail.md', '## Precedence'],
  ['phase-detail.md', '## Judgment'],
  ['composition.md', '## Inventory before layout'],
  ['phase-direction.md', '## Mood to look'],
  ['phase-direction.md', '## Rung 3'],
  ['phase-direction.md', '## Judgment'],
  ['stack.md', '## Which stack'],
  ['typography.md', '## Pairing'],
  ['sketch-tab.md', '## The commands'],
  ['sketch-tab.md', '## The direction round'],
  ['sketch-tab.md', '## The answer'],
];

const ONE_PASS = [
  ['intake.md', '## Asking'],
  ['intake.md', '## The run directory'],
  ['intake.md', '## Settled identity'],
  ['phase-detail.md', '## Context'],
  ['phase-detail.md', '## Precedence'],
  ['phase-detail.md', '## Judgment'],
  ['composition.md', '## Inventory before layout'],
  ['composition.md', '## Turn subject evidence into a system'],
  ['composition.md', '## Choose structures from relationships'],
  ['composition.md', '## Write a composition contract'],
  ['phase-direction.md', '## Every rung'],
  ['phase-direction.md', '## Mood to look'],
  ['phase-direction.md', '## Judgment'],
  ['stack.md', '## Which stack'],
  ['visual-direction.md', '## Palette'],
  ['visual-direction.md', '## Direction contract'],
  ['visual-direction.md', '## Dials'],
  ['visual-direction.md', '## Material, depth, and atmosphere'],
  ['visual-direction.md', '## Visual material and imagery'],
  ['visual-direction.md', '## Whole-page visual logic'],
  ['visual-direction.md', '## Judgment'],
  ['typography.md', '## Source by character, not by list'],
  ['typography.md', '## Pairing'],
  ['tokens.md', '## Tiers'],
  ['build-pass.md', '## The build floor'],
  ['build-pass.md', '## Proof'],
  ['phase-build.md', '## Where the build runs'],
  ['phase-build.md', '## Capture, look, fix once'],
];

// visual-direction is read whole but for these three, so a new section there
// joins the one-pass set and must appear in ONE_PASS.
const VISUAL_DIRECTION_SKIPPED = ['## Contents', '## Design context first', '## Reference, variant, selection'];

// Second-level headings outside fenced code, with their line index.
function headings(lines) {
  const found = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && line.startsWith('## ')) found.push({ heading: line.trimEnd(), index });
  });
  return found;
}

// Bytes from the heading line through the line before the next `## ` heading.
function sectionBytes(file, heading) {
  const lines = read(`references/${file}`).split('\n');
  const found = headings(lines);
  const at = found.findIndex((entry) => entry.heading === heading);
  assert.notEqual(at, -1, `${file} holds ${heading}`);
  const end = at + 1 < found.length ? found[at + 1].index : lines.length;
  return Buffer.byteLength(lines.slice(found[at].index, end).join('\n') + '\n', 'utf8');
}

function setBytes(pairs) {
  return Buffer.byteLength(read('SKILL.md'), 'utf8') + pairs.reduce((sum, [file, heading]) => sum + sectionBytes(file, heading), 0);
}

test('the preview read set stays within 30,000 bytes', () => {
  const total = setBytes(PREVIEW);
  assert.ok(total <= PREVIEW_LIMIT, `preview read set is ${total} B, over ${PREVIEW_LIMIT}`);
});

test('the one-pass read set stays within 46,000 bytes', () => {
  const total = setBytes(ONE_PASS);
  assert.ok(total <= ONE_PASS_LIMIT, `one-pass read set is ${total} B, over ${ONE_PASS_LIMIT}`);
});

test('the one-pass set lists every visual-direction section but the three it skips', () => {
  const listed = ONE_PASS.filter(([file]) => file === 'visual-direction.md').map(([, heading]) => heading);
  const present = headings(read('references/visual-direction.md').split('\n')).map((entry) => entry.heading);
  assert.deepEqual(present.filter((heading) => !VISUAL_DIRECTION_SKIPPED.includes(heading)), listed);
});
