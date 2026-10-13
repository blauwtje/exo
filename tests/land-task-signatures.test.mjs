// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { git, gitRepository, planFixture, run } from './harness.mjs';
import { taskSection, SCRIPT } from './land-task-fixture.mjs';

// A task that changes an exported signature lands only when every caller of
// that name sits inside its Files:, since a caller outside it breaks unseen.
const SIGNATURE_PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Book date', files: ['- Modify: `src/ledger/create-entry.js`'], subject: 'feat(ledger): book date' }),
  taskSection({ number: 2, title: 'Book date everywhere', files: ['- Modify: `src/ledger/create-entry.js`', '- Modify: `src/import/import-rows.js`'], subject: 'feat(ledger): book date everywhere' })
] });

async function signatureCheckout() {
  const root = await gitRepository({
    'src/ledger/create-entry.js': 'export function createEntry(id, amount) {\n  return { id, amount };\n}\n',
    'src/import/import-rows.js': "import { createEntry } from '../ledger/create-entry.js';\nexport const importRows = (rows) => rows.map((row) => createEntry(row.id, row.amount));\n",
    'docs/plans/fixture.md': SIGNATURE_PLAN
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

async function requireBookedOn(root) {
  await fs.writeFile(path.join(root, 'src/ledger/create-entry.js'), 'export function createEntry(id, amount, bookedOn) {\n  return { id, amount, bookedOn };\n}\n');
}

test('a changed export signature with a caller outside Files: is refused as PLAN DRIFT', async () => {
  const { root, planPath } = await signatureCheckout();
  await requireBookedOn(root);
  const drift = 'PLAN DRIFT: Task 1: src/ledger/create-entry.js:createEntry(id, amount) -> (id, amount, bookedOn); callers outside Files: src/import/import-rows.js';
  assert.throws(() => landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root }), (error) => error instanceof LandingError && error.message === drift);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `${drift}\n`);
});

test('a changed export signature with every caller inside Files: lands', async () => {
  const { root, planPath } = await signatureCheckout();
  await requireBookedOn(root);
  await fs.writeFile(path.join(root, 'src/import/import-rows.js'), "import { createEntry } from '../ledger/create-entry.js';\nexport const importRows = (rows) => rows.map((row) => createEntry(row.id, row.amount, row.date));\n");
  const output = landTask({ planPath, planText: SIGNATURE_PLAN, number: 2, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 2\nProof: ! pwd \| grep -q red-green-: pass \(exit 0\)\nLanded: 2\nRoute: unit \(.+\)\nNext: Task 1\n$/);
  const message = git(root, 'log', '-1', '--format=%B');
  assert.match(message, /^Plan-task: fixture\/2\nSignature: src\/ledger\/create-entry\.js:createEntry\(id, amount\) -> \(id, amount, bookedOn\)$/m);
});

// Only a change a caller can feel refuses: more required parameters, fewer
// parameters in total, or a rest parameter taken away.
const CALLER_SAFE_SIGNATURES = {
  'a renamed parameter': '(entryId, amount)',
  'an added default parameter': "(id, amount, bookedOn = '')",
  'an added optional typed parameter': '(id, amount, bookedOn?)',
  'an added rest parameter': '(id, amount, ...notes)'
};

for (const [change, parameters] of Object.entries(CALLER_SAFE_SIGNATURES)) {
  test(`${change} on an export with an outside caller lands`, async () => {
    const { root, planPath } = await signatureCheckout();
    await fs.writeFile(path.join(root, 'src/ledger/create-entry.js'), `export function createEntry${parameters} {\n  return {};\n}\n`);
    const output = landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root });
    assert.match(output, /^Committed: [0-9a-f]+ Task 1\nProof: ! pwd \| grep -q red-green-: pass \(exit 0\)\nLanded: 1\nRoute: unit \(.+\)\nNext: Task 2\n$/);
  });
}

const CALLER_BREAKING_SIGNATURES = {
  'a dropped parameter': ['(id, amount)', '(id)'],
  'a default turned required': ["(id, amount = 0)", '(id, amount)'],
  'a rest parameter taken away': ['(id, ...parts)', '(id, parts)']
};

for (const [change, [before, after]] of Object.entries(CALLER_BREAKING_SIGNATURES)) {
  test(`${change} on an export with an outside caller is refused as PLAN DRIFT`, async () => {
    const { root, planPath } = await signatureCheckout();
    const file = path.join(root, 'src/ledger/create-entry.js');
    await fs.writeFile(file, `export function createEntry${before} {}\n`);
    git(root, 'commit', '-q', '-am', 'set up the old signature');
    await fs.writeFile(file, `export function createEntry${after} {}\n`);
    assert.throws(() => landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root }), (error) => error instanceof LandingError && /^PLAN DRIFT: Task 1: src\/ledger\/create-entry\.js:createEntry\(/.test(error.message));
  });
}

test('a body-only change to an export with an outside caller lands and prints nothing extra', async () => {
  const { root, planPath } = await signatureCheckout();
  await fs.writeFile(path.join(root, 'src/ledger/create-entry.js'), 'export function createEntry(id,\n  amount) {\n  return { id, amount: Number(amount) };\n}\n');
  const output = landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1\nProof: ! pwd \| grep -q red-green-: pass \(exit 0\)\nLanded: 1\nRoute: unit \(.+\)\nNext: Task 2\n$/);
});
