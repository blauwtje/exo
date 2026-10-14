import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './harness.mjs';
import { planText, setup, RUNNER, PLUGIN_ROOT, taskSubject } from './run-plan-fixture.mjs';

const THIRD_TASK = [
  '### Task 3: feat(c): add c',
  'Depends on: 2 | Files: `c.txt` | Data: a line | Proof: node --version | Red: none (fixture)',
  ''
].join('\n');

test('resume: three landed tasks cost at most two Plan-task log reads', async () => {
  const context = await setup();
  await fs.writeFile(context.plan, `${planText(context.root)}${THIRD_TASK}`);
  git(context.root, 'commit', '-q', '-am', 'docs: add a third task');
  const subjects = [taskSubject(1), taskSubject(2), 'feat(c): add c'];
  for (const [index, subject] of subjects.entries()) {
    git(context.root, 'commit', '-q', '--allow-empty', '-m', subject, '-m', `Plan-task: plan/${index + 1}`);
  }
  const shims = await fixture();
  const count = path.join(shims, 'count.txt');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(shims, 'git'), `#!/bin/sh\ncase "$*" in *"log --grep=^Plan-task: "*) echo $PPID >> "${count}";; esac\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const scenario = path.join(context.tools, 'scenario.json');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps: [{ result: 'Verify done.' }] }));
  const env = { ...process.env, PATH: `${shims}${path.delimiter}${process.env.PATH}`, STUB_SCENARIO: scenario, STUB_RECORD: path.join(context.tools, 'calls.jsonl'), HOME: context.home, CLAUDECODE: '1' };
  const runner = execFile(process.execPath, [RUNNER, context.plan, '--root', context.root, '--claude', context.stub, '--session', 'task'], { cwd: context.root, env });
  const finished = new Promise((resolve) => runner.on('close', resolve));
  await finished;
  const reads = (await fs.readFile(count, 'utf8')).split('\n').filter((caller) => caller === String(runner.pid)).length;
  assert.ok(reads >= 1, 'the shim saw the log read');
  assert.ok(reads <= 2, `the commit log was read ${reads} times`);
});
