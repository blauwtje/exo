// context.mjs reports approval_status in its JSON (tested in ui-design-scripts.test.mjs);
// this guards that the design-ui references actually read it instead of sending the
// model into DESIGN.md's body to learn whether an identity is approved or a draft.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const INTAKE = read('skills/design-ui/references/intake.md');
const VISUAL_DIRECTION = read('skills/design-ui/references/visual-direction.md');

test('rung 5 settled identity gates on approval_status, not an open DESIGN.md read', () => {
  assert.ok(INTAKE.includes('`approval_status` of `approved`'), 'rung 5 names the approved value');
  assert.ok(INTAKE.includes("A `draft` `approval_status` is not settled"), 'a draft identity is excluded');
  assert.ok(!INTAKE.includes('a `scripts/context.mjs` status other than `absent`'), 'the old ungated phrasing is gone');
});

test('visual-direction reads approval_status from context.mjs before opening DESIGN.md', () => {
  assert.ok(
    VISUAL_DIRECTION.includes("Read the `approval_status` field `scripts/context.mjs --status` reports"),
    'the design-context-first bullet checks the field before the body'
  );
  assert.ok(
    VISUAL_DIRECTION.includes('open the body, through `--surface` and `--needs`, only for the sections the task needs'),
    'the body opens only for sections a task needs'
  );
  assert.ok(
    VISUAL_DIRECTION.includes("A DESIGN.md decision whose `approval_status` reads `approved` outranks a new direction"),
    'the judgment rule names the field, not a plain read of the file'
  );
  assert.ok(!VISUAL_DIRECTION.includes('An approved durable decision in DESIGN.md outranks a new direction'), 'the old ungated phrasing is gone');
});
