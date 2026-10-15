import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git } from './harness.mjs';
import { runPlan, setup } from './run-plan-fixture.mjs';

const reply = 'Landed: a.txt\nProof:\n- `node --version`: pass\nUnresolved: none';

test('a no red proof refusal goes straight to one repair session, then stops blocked', async () => {
  const context = await setup();
  const text = await fs.readFile(context.plan, 'utf8');
  await fs.writeFile(context.plan, text.replace('Proof: node --version | Red: none (fixture)', 'Proof: node --version'));
  git(context.root, 'commit', '-q', '-am', 'docs: drop the Red field');
  await fs.appendFile(path.join(context.root, '.git', 'info', 'exclude'), '.exo/\n');
  await fs.mkdir(path.join(context.root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(context.root, '.exo', 'implementer-1.md'), 'Landed: stale report from an earlier run process\n');
  const result = await runPlan(context, [{ edits: ['a.txt'], result: `${reply}\nTask 1: GREEN` }, { result: 'Nothing to repair.' }, { result: 'Unused.' }]);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(await fs.readFile(path.join(context.root, '.exo', 'implementer-1.md'), 'utf8'), `${reply}\n`, 'the script replaced a report left by an earlier run process with the final reply');
  assert.equal(result.calls.length, 2, 'one task session and one repair session, no second try');
  assert.match(result.calls[1].stdin, /^Plan repair of task 1 /m);
  assert.match(result.calls[1].stdin, /tighten the Proof first/);
  assert.match(result.calls[1].stdin, /add `Red: none \(<reason>\)`/);
  assert.match(result.stdout, /Task 1 is blocked: .*no red proof/);
});

test('a repair that only adds the no-red reason lands the task by script, with no second task session', async () => {
  const context = await setup();
  const text = await fs.readFile(context.plan, 'utf8');
  const withoutRed = text.replace('Proof: node --version | Red: none (fixture)', 'Proof: node --version');
  await fs.writeFile(context.plan, withoutRed.slice(0, withoutRed.indexOf('### Task 2')));
  git(context.root, 'commit', '-q', '-am', 'docs: drop the Red field and task 2');
  await fs.appendFile(path.join(context.root, '.git', 'info', 'exclude'), '.exo/\n');
  const record = path.join(context.tools, 'calls.jsonl');
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  const rewrite = [
    "import fs from 'node:fs';",
    `const calls = fs.existsSync(${JSON.stringify(record)}) ? fs.readFileSync(${JSON.stringify(record)}, 'utf8').split('\\n').filter(Boolean).length : 0;`,
    'if (calls === 1) {',
    `  const planText = fs.readFileSync(${JSON.stringify(context.plan)}, 'utf8');`,
    `  fs.writeFileSync(${JSON.stringify(context.plan)}, planText.replace('Proof: node --version', 'Proof: node --version | Red: none (fixture)'));`,
    '}',
    `await import(${JSON.stringify(context.stub)});`,
    ''
  ].join('\n');
  await fs.writeFile(wrapper, rewrite);
  const result = await runPlan({ ...context, stub: wrapper }, [{ edits: ['a.txt'], result: `${reply}\nTask 1: GREEN` }, { result: 'Plan repaired.' }, { result: 'Unused.' }]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 2, 'one task session and one repair session, no second task session');
  assert.match(result.calls[1].stdin, /^Plan repair of task 1 /m);
});
