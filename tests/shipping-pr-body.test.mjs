import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/ship/scripts/pr-body.mjs', import.meta.url));
const SECTIONS = '## Why\n\nShip a reviewer-ready body.\n\n## What changed\n\n- skills/ship: new script\n\n## Read order\n\nnone\n\n## Risk areas\n\n\n## Follow-ups\n\n- Stack the pull requests\n';
const THREE_ITEMS = 'Intro\n\n- [ ] first criterion\n- [x] second criterion\n* [ ] third criterion\n\n```\n- [ ] inside a fence\n```\n';

async function workspace(issueBodies) {
  const root = await fixture();
  const bin = path.join(root, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(root, 'issues.json'), JSON.stringify(issueBodies));
  const stub = `#!/bin/sh\nif [ "$1 $2" != "issue view" ] || [ "$4" != "--json" ] || [ "$5" != "body" ]; then exit 9; fi\nnode -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]]; if(b===undefined) process.exit(1); console.log(JSON.stringify({body:b}))' "${path.join(root, 'issues.json')}" "$3"\n`;
  await fs.writeFile(path.join(bin, 'gh'), stub, { mode: 0o755 });
  await fs.writeFile(path.join(root, 'sections.md'), SECTIONS);
  return { root, env: { PATH: `${bin}:${process.env.PATH}`, HOME: root } };
}

const invoke = (space, args) => run(SCRIPT, ['--sections', path.join(space.root, 'sections.md'), ...args], { env: space.env });

test('an issue with three checklist items yields three table rows', async () => {
  const space = await workspace({ 7: THREE_ITEMS });
  const outcome = await invoke(space, ['--branch', 'feat/7-pr-body']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const rows = outcome.stdout.split('\n').filter((line) => /^\| (first|second|third) criterion/.test(line));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.includes('| unverifiable | none |')));
  assert.match(outcome.stdout, /Closes #7\n$/);
});

test('verdicts fill status and evidence, and a met row without evidence stays unverifiable', async () => {
  const space = await workspace({ 7: THREE_ITEMS });
  const verdicts = [{ n: 1, status: 'met', evidence: 'tests/a.test.mjs:3' }, { item: 'Second criterion', status: 'met' }, { n: 3, status: 'unmet', evidence: 'gate check x' }];
  await fs.writeFile(path.join(space.root, 'verdicts.json'), JSON.stringify(verdicts));
  const outcome = await invoke(space, ['--issue', '7', '--verdicts', path.join(space.root, 'verdicts.json')]);
  assert.match(outcome.stdout, /\| first criterion \| met \| tests\/a\.test\.mjs:3 \|/);
  assert.match(outcome.stdout, /\| second criterion \| unverifiable \| none \|/);
  assert.match(outcome.stdout, /\| third criterion \| unmet \| gate check x \|/);
});

test('an issue without checklist items yields no table', async () => {
  const space = await workspace({ 8: 'Plain prose, no checklist.\n' });
  const outcome = await invoke(space, ['--branch', 'fix/8-thing']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.doesNotMatch(outcome.stdout, /## Acceptance|\| Criterion/);
  assert.match(outcome.stdout, /Closes #8/);
});

test('no issue means no table and no Closes line, and an unreadable issue is noted', async () => {
  const space = await workspace({});
  const none = await invoke(space, ['--branch', 'p2-b-pr-body']);
  assert.doesNotMatch(none.stdout, /Closes|Acceptance/);
  const missing = await invoke(space, ['--issue', '99']);
  assert.match(missing.stderr, /NOTE issue #99 unreadable/);
  assert.doesNotMatch(missing.stdout, /Acceptance/);
});

test('the issue comes from the plan header or an existing Closes line before the branch', async () => {
  const space = await workspace({ 5: '- [ ] from plan\n', 6: '- [ ] from closes\n', 7: '- [ ] from branch\n' });
  await fs.writeFile(path.join(space.root, 'plan.md'), '## Plan basis\nIssue: #5\nBranch: x\n');
  const plan = await invoke(space, ['--plan', path.join(space.root, 'plan.md'), '--branch', 'feat/7-x']);
  assert.match(plan.stdout, /from plan/);
  await fs.writeFile(path.join(space.root, 'sections.md'), `${SECTIONS}\nCloses #6\n`);
  const closes = await invoke(space, ['--plan', path.join(space.root, 'plan.md'), '--branch', 'feat/7-x']);
  assert.match(closes.stdout, /from closes/);
});

test('empty sections are omitted and the rest keep their order', async () => {
  const space = await workspace({});
  const outcome = await invoke(space, []);
  const headings = outcome.stdout.split('\n').filter((line) => line.startsWith('## '));
  assert.deepEqual(headings, ['## Why', '## What changed', '## Follow-ups']);
});

test('the proof section copies only the gate lines, and is absent without a gate report', async () => {
  const space = await workspace({});
  await fs.writeFile(path.join(space.root, 'gate.txt'), 'noise\nPASS npm run validate:static\nSUMMARY FAIL=0 WARN=0 UNRUN=0\nmore noise\n');
  const withGate = await invoke(space, ['--gate', path.join(space.root, 'gate.txt')]);
  assert.match(withGate.stdout, /## Proof\n\n```\nPASS npm run validate:static\nSUMMARY FAIL=0 WARN=0 UNRUN=0\n```/);
  assert.doesNotMatch(withGate.stdout, /noise/);
  assert.doesNotMatch((await invoke(space, [])).stdout, /## Proof/);
});

test('the length cap cuts low-priority sections first and refuses a body it cannot fit', async () => {
  const space = await workspace({});
  const long = `${SECTIONS}\n${'- more follow-up detail\n'.repeat(40)}`;
  await fs.writeFile(path.join(space.root, 'sections.md'), long);
  await fs.mkdir(path.join(space.root, '.config', 'exo'), { recursive: true });
  const config = path.join(space.root, '.config', 'exo', 'run.json');
  await fs.writeFile(config, JSON.stringify({ defaults: { prBodyBytes: 200 } }));
  const cut = await invoke(space, []);
  assert.equal(cut.code, 0, cut.stderr);
  assert.ok(Buffer.byteLength(cut.stdout) <= 200);
  assert.match(cut.stderr, /CUT Follow-ups/);
  assert.match(cut.stdout, /## Why/);
  await fs.writeFile(config, JSON.stringify({ defaults: { prBodyBytes: 20 } }));
  const over = await invoke(space, []);
  assert.equal(over.code, 4);
  assert.equal(over.stdout, '');
  assert.match(over.stderr, /OVER cap 20/);
});

test('the default cap is 4096 bytes', async () => {
  const space = await workspace({});
  await fs.writeFile(path.join(space.root, 'sections.md'), `## Why\n\n${'x'.repeat(5000)}\n`);
  const outcome = await invoke(space, []);
  assert.equal(outcome.code, 4);
  assert.match(outcome.stderr, /OVER cap 4096/);
});
