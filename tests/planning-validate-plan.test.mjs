// Behavioral tests for the planning plan-artifact validator: `node --test`
// discovers this file automatically (README.md "node --test").

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture as temporaryDirectory, run as runScript } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/planning/scripts/validate-plan.mjs', import.meta.url));

async function fixture(content) {
  const file = path.join(await temporaryDirectory(), 'plan.md');
  await fs.writeFile(file, content);
  return file;
}

// Every case validates the same script, and each fixture path is absolute, so
// the harness default working directory never reaches the assertions.
const run = (args) => runScript(SCRIPT, args);

/** Replace `search` in `text` exactly once; throws if the fixture has drifted. */
function replaceOnce(text, search, replacement) {
  const count = text.split(search).length - 1;
  assert.equal(count, 1, `expected exactly one occurrence of ${JSON.stringify(search)}`);
  return text.replace(search, replacement);
}

// A placeholder word sits in Context (exempt from the placeholder scan) and
// cp1 is a read-only 'Touches: none' checkpoint — both must still pass.
const VALID_PLAN = `# Sample plan

## Goal

Ship the sample feature end to end.

## Plan basis

Repository: /tmp/sample-repo
Branch: main

Repository \`/tmp/sample-repo\`, branch \`main\` at \`abc1234\`, clean worktree. Tool versions: node 20 confirmed present. Drift policy: drift found before a checkpoint's edits means make no edit; drift found after means revert only that checkpoint's changes and restore the last verified green state, then stop. Executor loads the \`implementing\` skill on this plan before the first checkpoint.

## Non-goals

- No changes to the deployment pipeline.

## Context

- \`src/app.js:10\` defines \`startServer()\`. Whatever handling is appropriate downstream is out of scope for this note.

## Steps

### confirm-baseline — confirm the starting state

Freedom: LOCKED
Depends on: none

Touches: none

Current: the repository is at the baseline commit with a clean working tree.
Target: baseline confirmed; no repository change.
Wiring: none.

Verify: \`git status --porcelain\` → empty output.
On drift: the working tree is dirty → make no edit, stop, report \`PLAN DRIFT: confirm-baseline\`.
Done when: the verify command reports a clean tree.

### add-health-endpoint — add the health endpoint

Freedom: GUIDED
Depends on: confirm-baseline

Touches:
- \`src/app.js\` — anchor: exact string ("no existing /health route")

Current: \`src/app.js\` exposes no \`/health\` route.
Target: \`src/app.js\` exposes \`GET /health\` returning \`{ ok: true }\` as JSON.
Wiring: none — no existing caller depends on this route.

Edit:
- \`src/app.js\` — replace:
  \`\`\`
  current text
  \`\`\`
  with:
  \`\`\`
  new text
  \`\`\`


RED: add a supertest assertion for \`GET /health\` and observe it fail with 404.
GREEN: add the route handler.
VERIFY: rerun the test and observe it pass.

Verify: \`npm test -- health\` → the new test passes.
On drift: \`src/app.js\` already exposes \`/health\` → revert only this checkpoint's changes, restore the last verified green state, stop, report \`PLAN DRIFT: add-health-endpoint\`.
Done when: \`GET /health\` returns \`{ ok: true }\` and the test suite is green.

## Final verification

1. \`npm test\` → full suite green.
Walkthrough: \`npm start\`, then \`curl localhost:3000/health\` and read \`{ ok: true }\`.

## Open questions

None.
`;

// A frontend plan: one `.css` and one `.tsx` Touches path, the conditional
// `## Visual direction` section, and a DESIGN checkpoint closing on `Render:`.
const FRONTEND_PLAN = `# Sample frontend plan

## Goal

Ship the settings panel redesign.

## Plan basis

Repository: /tmp/sample-app
Branch: main

Repository \`/tmp/sample-app\`, branch \`main\` at \`abc1234\`, clean worktree. Tool versions: node 20 confirmed present. Drift policy: drift found before a checkpoint's edits means make no edit; drift found after means revert only that checkpoint's changes and restore the last verified green state, then stop. Executor loads the \`implementing\` skill on this plan before the first checkpoint.

## Non-goals

- No changes to the settings API.

## Context

- \`src/SettingsPanel.tsx\` renders the current panel from hardcoded spacing values.

## Visual direction

Design skill: ui-design

Quiet instrument panel: one accent, dense type, no decorative surfaces. The choice rests on the product's existing dashboard shell, read this session. Fixed choices an executor may not invent: the accent hue, the 4px spacing grid, and the panel's two-column split.

## Steps

### add-spacing-tokens — add the panel spacing tokens

Freedom: DESIGN
Depends on: none

Touches:
- \`src/settings.css\` — anchor: exact string ("--panel-gap")

Current: \`src/settings.css\` carries no panel spacing tokens.
Target: \`src/settings.css\` defines the panel spacing scale inside the direction fixed above; the frontend-design skill the executing session has loaded decides the exact steps and is loaded immediately before this edit.
Wiring: \`src/SettingsPanel.tsx\` consumes the tokens in apply-panel-tokens.

Edit:
- \`src/settings.css\` — replace:
  \`\`\`
  current text
  \`\`\`
  with:
  \`\`\`
  new text
  \`\`\`


Render: the settings panel at 375px and 1280px → the two-column split holds and the accent appears exactly once.
On drift: \`src/settings.css\` already defines panel spacing tokens → make no edit, stop, report \`PLAN DRIFT: add-spacing-tokens\`.
Done when: the panel renders on the fixed spacing scale at both viewports.

### apply-panel-tokens — apply the tokens in the panel component

Freedom: GUIDED
Depends on: add-spacing-tokens

Touches:
- \`src/SettingsPanel.tsx\` — anchor: symbol (\`SettingsPanel\`)

Current: \`SettingsPanel\` hardcodes its spacing values.
Target: \`SettingsPanel\` reads every spacing value from the tokens in \`src/settings.css\`.
Wiring: no other component imports \`SettingsPanel\`'s styles.

Edit:
- \`src/SettingsPanel.tsx\` — replace:
  \`\`\`
  current text
  \`\`\`
  with:
  \`\`\`
  new text
  \`\`\`


Verify: \`npm test -- SettingsPanel\` → the spacing assertion passes.
On drift: \`SettingsPanel\` already reads the tokens → revert only this checkpoint's changes, restore the last verified green state, stop, report \`PLAN DRIFT: apply-panel-tokens\`.
Done when: the panel renders from the tokens and the test suite is green.

## Final verification

1. \`npm test\` → full suite green.
Walkthrough: \`npm start\`, then \`curl localhost:3000/health\` and read \`{ ok: true }\`.

## Open questions

None.
`;

const VISUAL_DIRECTION_SECTION = "## Visual direction\n\nDesign skill: ui-design\n\nQuiet instrument panel: one accent, dense type, no decorative surfaces. The choice rests on the product's existing dashboard shell, read this session. Fixed choices an executor may not invent: the accent hue, the 4px spacing grid, and the panel's two-column split.\n\n";
const RENDER_LINE = 'Render: the settings panel at 375px and 1280px → the two-column split holds and the accent appears exactly once.';

/** Downgrade the fixture's only DESIGN checkpoint, restoring the `Verify:` line the
 *  grammar requires everywhere else, so a case can exercise one trigger in isolation. */
const withoutDesignCheckpoint = (text) => replaceOnce(
  replaceOnce(text, 'Freedom: DESIGN', 'Freedom: GUIDED'),
  RENDER_LINE,
  'Verify: `npm test -- settings-tokens` → the token assertion passes.'
);

// A third frontend checkpoint that reaches the DESIGN checkpoint only through apply-panel-tokens.
const SECOND_HOP_CHECKPOINT = `### restyle-panel-header — restyle the panel header

Freedom: GUIDED
Depends on: apply-panel-tokens

Touches:
- \`src/SettingsHeader.tsx\` — anchor: symbol (\`SettingsHeader\`)

Current: \`SettingsHeader\` sets its own padding inline.
Target: \`SettingsHeader\` reads the same spacing tokens \`SettingsPanel\` reads.
Wiring: \`SettingsPanel\` is the only caller of \`SettingsHeader\`.

Edit:
- \`src/SettingsHeader.tsx\` — replace:
  \`\`\`
  current text
  \`\`\`
  with:
  \`\`\`
  new text
  \`\`\`


Verify: \`npm test -- SettingsHeader\` → the header spacing assertion passes.
On drift: \`SettingsHeader\` already reads the tokens → revert only this checkpoint's changes, restore the last verified green state, stop, report \`PLAN DRIFT: restyle-panel-header\`.
Done when: the header renders from the tokens and the test suite is green.

`;

async function expectInvalid(content, messageFragment) {
  const file = await fixture(content);
  const result = await run([file]);
  assert.equal(result.code, 1, `stdout was: ${result.stdout}`);
  assert.match(result.stdout, /PLAN_VALID:false\n$/);
  const problemLines = result.stdout.trim().split('\n');
  assert.ok(problemLines.some((line) => /^line \d+: /.test(line)), 'expected at least one line-numbered problem');
  assert.ok(result.stdout.includes(messageFragment), `expected stdout to mention ${JSON.stringify(messageFragment)}, got:\n${result.stdout}`);
}

test('accepts a valid plan with a placeholder word in Context and a read-only checkpoint', async () => {
  const file = await fixture(VALID_PLAN);
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

test('rejects a plan missing a required section', () =>
  expectInvalid(VALID_PLAN.replace(/## Non-goals\n\n- No changes to the deployment pipeline\.\n\n/, ''), "missing required section '## Non-goals'"));

test('rejects an empty required section', () =>
  expectInvalid(replaceOnce(VALID_PLAN, '## Goal\n\nShip the sample feature end to end.\n', '## Goal\n'), "'## Goal' section is empty"));

test('rejects a Plan basis that omits the next-skill sentence', () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, ' Executor loads the \`implementing\` skill on this plan before the first checkpoint.', ''),
    "'## Plan basis' does not close with the literal sentence"
  ));

test('rejects an Open questions section that lists neither a marker nor None', () =>
  expectInvalid(replaceOnce(VALID_PLAN, '## Open questions\n\nNone.\n', '## Open questions\n\nNothing to report.\n'), "'## Open questions' lists neither"));

test('rejects an empty Steps section', () =>
  expectInvalid(VALID_PLAN.replace(/## Steps\n[\s\S]*?(?=## Final verification)/, '## Steps\n\n'), "'## Steps' section is empty"));

test("rejects an Open questions body that only starts a sentence with 'None'", () =>
  expectInvalid(replaceOnce(VALID_PLAN, '## Open questions\n\nNone.\n', '## Open questions\n\nNone of the reviewers agreed on the retry budget.\n'), "'## Open questions' lists neither"));

test('rejects a plan whose required sections are out of relative order', () => {
  const nonGoals = '## Non-goals\n\n- No changes to the deployment pipeline.\n\n';
  const context = "## Context\n\n- `src/app.js:10` defines `startServer()`. Whatever handling is appropriate downstream is out of scope for this note.\n\n";
  const swapped = VALID_PLAN.replace(nonGoals + context, context + nonGoals);
  return expectInvalid(swapped, 'out of the required relative order');
});

// A second `## Steps` heading leaves its own checkpoints outside every bounded check.
test('rejects a duplicate required section heading', () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, '## Final verification', '## Steps\n\n### cp3-orphan\n\nFreedom: WHATEVER\n\n## Final verification'),
    "duplicate section '## Steps'"
  ));

test('rejects a Freedom line carrying trailing text', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Freedom: GUIDED', 'Freedom: GUIDED extra'), "'Freedom:' must be exactly one of LOCKED, GUIDED, OPEN"));

test('rejects a dependency on a missing checkpoint id', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Depends on: confirm-baseline', 'Depends on: cp1-missing'), "unknown checkpoint id 'cp1-missing'"));

test('rejects a valueless Depends on line', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Depends on: confirm-baseline', 'Depends on:'), "missing or has an empty 'Depends on:' field"));

test("rejects a 'Depends on:' value that names no checkpoint id", () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Depends on: confirm-baseline', 'Depends on: ,'), "'Depends on:' names no checkpoint id"));

test('rejects a self-dependency', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Depends on: none', 'Depends on: confirm-baseline'), "'confirm-baseline' depends on itself"));

test('rejects a dependency cycle', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Depends on: none', 'Depends on: add-health-endpoint'), 'dependency cycle:'));

test('rejects a Touches anchor that is a bare line reference', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'anchor: exact string ("no existing /health route")', 'anchor: src/app.js:42-50'), 'bare line reference'));

// A malformed bullet is a grammar problem, not a 'Touches: none' declaration.
test("reports a malformed Touches entry without claiming 'Touches: none'", async () => {
  const file = await fixture(replaceOnce(VALID_PLAN, '- \`src/app.js\` — anchor: exact string ("no existing /health route")', '- src/app.js anchor symbol'));
  const result = await run([file]);
  assert.equal(result.code, 1, `stdout was: ${result.stdout}`);
  assert.ok(result.stdout.includes('Touches entry does not match'), result.stdout);
  assert.ok(!result.stdout.includes("declares 'Touches: none'"), result.stdout);
});

test('rejects a Touches anchor type outside the six declared types', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'anchor: exact string ("no existing /health route")', 'anchor: paragraph'), 'not one of the six declared types'));

test("rejects 'Touches: none' when Target omits the literal phrase", () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Target: baseline confirmed; no repository change.', 'Target: baseline confirmed.'), 'does not contain "no repository change"'));

test('rejects a checkpoint missing a required field', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Wiring: none — no existing caller depends on this route.\n\n', ''), "missing or has an empty 'Wiring:' field"));

test('rejects a clarification marker outside Open questions', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'is out of scope for this note.', 'is out of scope [NEEDS CLARIFICATION: confirm scope] for this note.'), 'marker appears outside'));

test('rejects a placeholder word in an instruction field', () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Wiring: none — no existing caller depends on this route.', 'Wiring: update callers as needed.'), 'placeholder text "as needed"'));

test("rejects an 'On drift:' line that omits its own PLAN DRIFT marker", () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, 'On drift: the working tree is dirty → make no edit, stop, report `PLAN DRIFT: confirm-baseline`.', 'On drift: something is off → stop.'),
    'does not name its own recovery marker'
  ));

// `add-health-endpoint-rollback` contains this checkpoint's id as a prefix, so a raw
// substring test would accept a marker naming a different checkpoint.
test("rejects an 'On drift:' marker whose id only extends the checkpoint id", () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, 'PLAN DRIFT: add-health-endpoint`', 'PLAN DRIFT: add-health-endpoint-rollback`'),
    'does not name its own recovery marker'
  ));

test('rejects an empty Final verification section', () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, "1. `npm test` → full suite green.\nWalkthrough: `npm start`, then `curl localhost:3000/health` and read `{ ok: true }`.\n", ''),
    "'## Final verification' section is empty"
  ));

test("rejects a Final verification section with no 'Walkthrough:' line", () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, "Walkthrough: `npm start`, then `curl localhost:3000/health` and read `{ ok: true }`.\n", ''),
    "carries no 'Walkthrough:' line"
  ));

test("rejects a bare 'Walkthrough: none'", () =>
  expectInvalid(
    replaceOnce(VALID_PLAN, "Walkthrough: `npm start`, then `curl localhost:3000/health` and read `{ ok: true }`.", 'Walkthrough: none'),
    "'Walkthrough: none' must state on the same line why"
  ));

test("accepts 'Walkthrough: none' carrying its reason", async () => {
  const file = await fixture(replaceOnce(VALID_PLAN, "Walkthrough: `npm start`, then `curl localhost:3000/health` and read `{ ok: true }`.", 'Walkthrough: none, the change only renames an internal helper with no user-visible result.'));
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
});

test('accepts a frontend plan carrying a Visual direction section and a DESIGN checkpoint', async () => {
  const file = await fixture(FRONTEND_PLAN);
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

test('rejects a frontend Touches path with no Visual direction section', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, VISUAL_DIRECTION_SECTION, ''), "'## Visual direction' section"));

// The DESIGN trigger would cover the fixture above on its own, so the path trigger
// needs a fixture carrying no DESIGN checkpoint at all.
test('rejects a frontend Touches path with neither a Visual direction section nor a DESIGN checkpoint', () => {
  const noDesign = withoutDesignCheckpoint(replaceOnce(FRONTEND_PLAN, VISUAL_DIRECTION_SECTION, ''));
  return expectInvalid(noDesign, "touches frontend path 'src/settings.css', so the plan needs a '## Visual direction' section");
});

test('rejects a frontend plan with no DESIGN checkpoint', () => {
  const noDesign = withoutDesignCheckpoint(FRONTEND_PLAN);
  return expectInvalid(noDesign, "'Freedom: DESIGN' checkpoint");
});

// A `?query` or `#fragment` suffix must not hide the extension from the path rule. The
// fixture drops its DESIGN checkpoint so only the path rule can reject it.
test('rejects a frontend path hidden behind a query or fragment suffix', () => {
  const suffixed = replaceOnce(
    replaceOnce(FRONTEND_PLAN, '- `src/settings.css` — anchor: exact string ("--panel-gap")', '- `src/settings.css?raw` — anchor: exact string ("--panel-gap")'),
    '- `src/SettingsPanel.tsx` — anchor: symbol (`SettingsPanel`)',
    '- `src/SettingsPanel.tsx#top` — anchor: symbol (`SettingsPanel`)'
  );
  return expectInvalid(withoutDesignCheckpoint(suffixed), "touches frontend path 'src/settings.css?raw'");
});

test('rejects a frontend checkpoint that does not reach a DESIGN checkpoint', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Depends on: add-spacing-tokens', 'Depends on: none'), "'apply-panel-tokens' touches frontend path"));

test('accepts a frontend checkpoint reaching the DESIGN checkpoint through a second hop', async () => {
  const file = await fixture(replaceOnce(FRONTEND_PLAN, '## Final verification', `${SECOND_HOP_CHECKPOINT}## Final verification`));
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

test("rejects a 'Render:' line on a checkpoint that is not DESIGN", () =>
  expectInvalid(
    replaceOnce(FRONTEND_PLAN, 'Verify: `npm test -- SettingsPanel` → the spacing assertion passes.', 'Verify: `npm test -- SettingsPanel` → the spacing assertion passes.\nRender: the settings panel at 1280px → the spacing holds.'),
    "carries a 'Render:' line"
  ));

test('rejects an empty Visual direction section', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, VISUAL_DIRECTION_SECTION, '## Visual direction\n\n'), "'## Visual direction' section is empty"));

// The grammar carries whatever name a planning session writes, so a skill this
// repository does not ship must validate exactly like one it does.
test('accepts a Visual direction section naming a design skill this repository does not ship', async () => {
  const file = await fixture(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', 'Design skill: impeccable'));
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

test('rejects a Visual direction section carrying no design-skill line', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design\n\n', ''), "no 'Design skill:' line"));

test('rejects a design-skill value that is a prose phrase rather than one name', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', 'Design skill: whichever skill the session has loaded'), 'names no single skill'));

// Only the first line is read, so two lines are rejected in either order rather than
// resolving to whichever one happens to come first.
test('rejects a Visual direction section carrying two design-skill lines', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', 'Design skill: ui-design\nDesign skill: none'), "more than one 'Design skill:' line"));

test('rejects two design-skill lines whose deferral comes first', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', 'Design skill: none\nDesign skill: ui-design'), "more than one 'Design skill:' line"));

// An illustrative line inside a fence names no skill an executor can act on.
test('rejects a design-skill line that appears only inside a fenced block', () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', '```\nDesign skill: ui-design\n```'), "no 'Design skill:' line"));

test("rejects 'Design skill: none' with no clarification marker in Open questions", () =>
  expectInvalid(replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', 'Design skill: none'), "requires a '[NEEDS CLARIFICATION' marker"));

test("accepts 'Design skill: none' against a clarification marker in Open questions", async () => {
  const deferred = replaceOnce(
    replaceOnce(FRONTEND_PLAN, 'Design skill: ui-design', 'Design skill: none'),
    '## Open questions\n\nNone.\n',
    '## Open questions\n\n- [NEEDS CLARIFICATION: which frontend-design skill should this plan load?]\n'
  );
  const file = await fixture(deferred);
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

test('rejects a DESIGN checkpoint with no frontend path and no Visual direction section', () =>
  expectInvalid(
    replaceOnce(
      replaceOnce(VALID_PLAN, 'Freedom: GUIDED', 'Freedom: DESIGN'),
      'Verify: `npm test -- health` → the new test passes.',
      'Render: the health endpoint at 375px and 1280px → the JSON body renders unchanged.'
    ),
    "so the plan needs a '## Visual direction' section"
  ));

test('rejects an empty Visual direction section in a plan with no frontend path', () =>
  expectInvalid(replaceOnce(VALID_PLAN, '## Steps', '## Visual direction\n\n## Steps'), "'## Visual direction' section is empty"));

test("rejects a DESIGN checkpoint closing on 'Verify:' instead of 'Render:'", () =>
  expectInvalid(
    replaceOnce(FRONTEND_PLAN, RENDER_LINE, 'Verify: `npm test -- settings-tokens` → the token assertion passes.'),
    "closes with 'Render:', not 'Verify:'"
  ));

test('exits 2 with no plan argument', async () => {
  const result = await run([]);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /^ERROR:args: /);
  assert.match(result.stdout, /PLAN_VALID:error\n$/);
});

test('exits 3 for a nonexistent plan file', async () => {
  const result = await run(['/tmp/planning-validate-plan-does-not-exist.md']);
  assert.equal(result.code, 3);
  assert.match(result.stdout, /^ERROR:read: /);
  assert.match(result.stdout, /PLAN_VALID:error\n$/);
});

// Node resolves the main module through symlinks while `process.argv[1]` keeps
// the symlinked path; the main() guard must compare real paths or the script
// exits 0 with no verdict at all (seen via `~/.claude/skills/planning/...`).
test('prints the verdict when invoked through a symlinked script path', async () => {
  const link = path.join(await temporaryDirectory(), 'validate-plan.mjs');
  await fs.symlink(SCRIPT, link);
  const result = await runScript(link, [await fixture(VALID_PLAN)]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

// An anchor detail that wraps onto an indented continuation line is still one
// Touches entry, not a second malformed bullet.
test('accepts a Touches entry whose anchor detail wraps onto a continuation line', async () => {
  const wrapped = replaceOnce(
    FRONTEND_PLAN,
    '- `src/settings.css` — anchor: exact string ("--panel-gap")',
    '- `src/settings.css` — anchor: exact string ("--panel-gap",\n  the first custom property in the file)'
  );
  const result = await run([await fixture(wrapped)]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.equal(result.stdout, 'PLAN_VALID:true\n');
});

// `Edit:` grammar: the edit is the spec, so a touched path without pasteable text is rejected.
const HEALTH_EDIT = "Edit:\n- `src/app.js` — replace:\n  ```\n  current text\n  ```\n  with:\n  ```\n  new text\n  ```\n";

test("rejects a checkpoint that touches a path but carries no 'Edit:' field", () =>
  expectInvalid(replaceOnce(VALID_PLAN, HEALTH_EDIT, ''), "has no 'Edit:' field"));

test("rejects an 'Edit:' entry whose path is not a Touches path", () =>
  expectInvalid(replaceOnce(VALID_PLAN, '- `src/app.js` — replace:', '- `src/other.js` — replace:'), "is not a 'Touches:' path"));

// A created markdown file may carry its own ``` blocks: the outer fence is longer, and
// only a fence at least as long as the opener closes it, so the inner ones are content.
const NESTED_FENCE_EDIT = "Edit:\n- `docs/recipe.md` — create:\n  ````md\n  # Recipe\n\n  ```css\n  .card { color: red; }\n  ```\n  ````\n";

test('accepts a create entry whose four-backtick block holds three-backtick fences', async () => {
  let plan = replaceOnce(VALID_PLAN, '- `src/app.js` — anchor: exact string ("no existing /health route")', '- `docs/recipe.md` — anchor: new-file (created whole by this checkpoint)');
  plan = replaceOnce(plan, HEALTH_EDIT, NESTED_FENCE_EDIT);
  const result = await run([await fixture(plan)]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.match(result.stdout, /PLAN_VALID:true\n$/);
});

test('rejects a create entry whose inner three-backtick fence is left open by a three-backtick outer fence', () =>
  expectInvalid(replaceOnce(replaceOnce(VALID_PLAN, '- `src/app.js` — anchor: exact string ("no existing /health route")', '- `docs/recipe.md` — anchor: new-file (created whole by this checkpoint)'), HEALTH_EDIT, NESTED_FENCE_EDIT.replaceAll('````', '```')), 'fenced block'));

test("rejects a 'create:' entry on a path whose anchor is not new-file", () =>
  expectInvalid(replaceOnce(VALID_PLAN, '- `src/app.js` — replace:', '- `src/app.js` — create:'), "must use 'replace:'"));

test("rejects a replace entry with no 'with:' line", () =>
  expectInvalid(replaceOnce(VALID_PLAN, '  with:\n', ''), "needs a fenced block with the verbatim current text, a 'with:' line"));

test("rejects a replace entry whose current-text block is empty", () =>
  expectInvalid(replaceOnce(VALID_PLAN, '  current text\n', ''), 'has an empty current-text block'));

test("rejects prose inside 'Edit:' outside a fenced block", () =>
  expectInvalid(replaceOnce(VALID_PLAN, '  with:\n', '  with:\n  then adjust the handler as appropriate\n'), 'carries prose outside a fenced block'));

test("rejects an 'Edit:' field on a 'Touches: none' checkpoint", () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Wiring: none.\n', "Wiring: none.\n\nEdit:\n- `src/app.js` — replace:\n  ```\n  x\n  ```\n  with:\n  ```\n  y\n  ```\n"), "declares 'Touches: none' but carries an 'Edit:'"));

test("rejects a 'Target:' longer than one sentence's worth of characters", () =>
  expectInvalid(replaceOnce(VALID_PLAN, 'Target: `src/app.js` exposes `GET /health` returning `{ ok: true }` as JSON.', `Target: ${'the route returns ok and '.repeat(14)}nothing else.`), "keep it to one sentence and move the behavior detail into 'Edit:'"));

test('accepts a field label that appears only inside an Edit fenced block', async () => {
  const file = await fixture(replaceOnce(VALID_PLAN, '  new text\n', '  new text\n  Verify: this is code, not a field\n  Render: also code\n'));
  const result = await run([file]);
  assert.equal(result.code, 0, `stdout was: ${result.stdout}`);
  assert.match(result.stdout, /PLAN_VALID:true\n$/);
});
