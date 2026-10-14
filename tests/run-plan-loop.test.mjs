// run-plan.mjs task loop: a done run, context and progress, the iteration cap,
// no progress, BLOCKED, denials, breaches and an exo that did not load.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { setup, PLUGIN_ROOT, runPlan, SANDBOX_RULE, land } from './run-plan-fixture.mjs';

test('done: two task processes and the tail land the plan, the gate passes and the remote is untouched', async () => {
  const context = await setup();
  const remoteBefore = git(context.bare, 'for-each-ref');
  const result = await runPlan(context, [land(1), { ...land(2), background: true }, { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  assert.equal(result.code, 0);
  assert.equal(result.calls.length, 2, 'a plan with no Risk: and no overlap needs no review session');
  assert.deepEqual(result.calls.map((call) => call.pin), ['plan/1', 'plan/2']);
  assert.match(result.calls[0].stdin, /^Land Task 1 of .*plan\.md in this session\./);
  const prompt = result.calls[0].stdin;
  const learnings = path.join(context.root, '.exo', 'run-plan', 'plan', 'learnings.md');
  assert.ok(prompt.includes('### Task 1: feat(a): add a\nDepends on: none | Files: `a.txt`'), 'the task section');
  for (const rule of [/^- Change only the files/m, /^- Read .*learnings\.md first/m, /^- Run one command per Bash call/m, /^End: .*the script proves and lands\.$/m]) assert.match(prompt, rule);
  assert.doesNotMatch(prompt, /^Land: /m, 'no land step in the session');
  assert.match(prompt, /^- `Task 1: GREEN`$/m);
  assert.match(prompt, /^- `Task 1: BLOCKED <reason>`/m);
  assert.match(prompt, /^- `Task 1: PLAN DRIFT <reason>`/m);
  for (const file of ['skills/build/references/task-mode.md', 'agents/build-task.md', 'skills/route-skills/references/lean.md']) {
    const lines = (await fs.readFile(path.join(PLUGIN_ROOT, file), 'utf8')).split('\n').filter((line) => line.startsWith('- '));
    assert.ok(lines.every((line) => !prompt.includes(line)), `${file} text is not pasted`);
  }
  assert.ok(!prompt.includes('land-task.mjs'), 'no land command: the script lands');
  assert.doesNotMatch(prompt, /^\/exo:build|## Design tasks|next-task\.mjs --plan|mcp-tool-call/m, 'no skill load, no design rule, no probe for a shell task');
  assert.equal(prompt.match(/### Task 1:/g).length, 1, 'the task section appears once');
  assert.ok(prompt.includes('Task 1: BLOCKED <file> is missing from the file list'));
  assert.ok(prompt.includes(learnings), 'the learnings path');
  assert.equal(await fs.readFile(learnings, 'utf8'), '# Learnings\n');
  const deny = result.calls[0].argv.slice(result.calls[0].argv.indexOf('--disallowedTools') + 1);
  for (const rule of ['Bash(git push *)', 'Bash(gh *)', 'Bash(git commit *)', 'Bash(git stash *)', 'Bash(git clean *)', 'Bash(git restore *)', 'Bash(git reset *)', 'Bash(node *settings.mjs*)']) assert.ok(deny.includes(rule), rule);
  assert.ok(result.calls[0].argv.includes(`Edit(/${context.root}/**)`));
  const argv = result.calls[0].argv;
  assert.equal(argv[argv.indexOf('--tools') + 1], 'Read,Edit,Write,Bash,Grep,Glob');
  assert.ok(deny.includes('mcp__*'));
  for (const flag of ['--disable-slash-commands', '--include-hook-events']) assert.ok(argv.includes(flag), flag);
  assert.ok(!argv.includes('--plugin-dir') && !argv.includes('--safe-mode'));
  assert.match(prompt, SANDBOX_RULE);
  assert.equal(git(context.bare, 'for-each-ref'), remoteBefore);
  assert.equal(git(context.bare, 'for-each-ref'), remoteBefore);
  const summary = await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8');
  assert.match(summary, /Task 1: [0-9a-f]{7,}/);
  assert.match(summary, /Open both files\./);
  assert.equal(summary.trim().split('\n').at(-1), result.stop);
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  const tasks = JSON.parse(await fs.readFile(path.join(logDir, 'tasks.json'), 'utf8'));
  assert.deepEqual(tasks.map((task) => [task.number, task.passes]), [[1, true], [2, true]]);
  const progress = await fs.readFile(path.join(logDir, 'progress.md'), 'utf8');
  assert.match(progress, /^- \[\d\d:\d\d:\d\d\] task 1 landed [0-9a-f]{7} · \d+s · \d+ turns · \d+k tokens · \$\d+\.\d\d$/m);
  assert.match(progress, /^- \[\d\d:\d\d:\d\d\] task 1 start: add a · \S+ \S+$/m);
  assert.match(progress, /^- \[\d\d:\d\d:\d\d\] average per task: \d+s · \d+ turns · \d+k tokens · \$\d+\.\d\d$/m);
  assert.match(progress, /^- \[\d\d:\d\d:\d\d\] total: \d+k tokens · \$\d+\.\d\d$/m);
  assert.equal(progress.trim().split('\n').at(-1), 'RUN COMPLETE');
  // Live lines: one per event, each prefixed with the elapsed time, then at most six summary lines.
  const live = result.stdout.trim().split('\n');
  const events = live.filter((line) => /^\[\d\d:\d\d:\d\d\] /.test(line)).map((line) => line.replace(/^\[\d\d:\d\d:\d\d\] /, ''));
  assert.match(events[0], /^run start: .*plan\.md, branch feat\/run, 2 tasks \(2 to build\)$/);
  assert.deepEqual(events.slice(1).map((line) => line.replace(/ [0-9a-f]{7} · .*$/, '').replace(/^(task \d start: .*?) · .*$/, '$1').replace(/^(average per task:|total:) .*$/, '$1')), ['task 1 start: add a', 'task 1 landed', 'task 2 start: add b', 'task 2 landed', 'Red-green: skipped (Red: none (fixture))', 'all tasks landed, final review start', 'average per task:', 'total:', 'run done']);
  const summaryPart = live.slice(live.findIndex((line) => !/^\[\d\d:\d\d:\d\d\] /.test(line)));
  assert.ok(summaryPart.length <= 6, summaryPart.join('\n'));
  assert.equal(summaryPart[0], 'Landed 2 of 2 tasks: 1, 2.');
  assert.match(summaryPart.join('\n'), /^Next: review branch feat\/run, then push it or open a pull request/m);
  assert.match(summaryPart.join('\n'), /^Cost \$\d+\.\d\d, time \d+s\.$/m);
  assert.doesNotMatch(result.stdout, /Open both files|Unresolved|reported\)/);
});

test('context: each task line ends with its peak context and a task over budget is flagged but still lands', async () => {
  const context = await setup();
  const usage = (input, read, created) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: created });
  const result = await runPlan(context, [
    { ...land(1), usage: usage(1000, 69000, 2000) },
    { ...land(2), usage: usage(500, 20000, 1500) },
    { result: 'Verify done.' }
  ]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  const detail = await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8');
  assert.match(detail, /^Task 1: .*, peak context 72k$/m);
  assert.match(detail, /^Task 2: .*, peak context 22k$/m);
  assert.match(detail, /^Task 1: peak context 72k is over the 60k budget; split similar tasks next time$/m);
  assert.doesNotMatch(detail, /Task 2: peak context .* is over/);
});

test('scratch: the run leaves no untracked .exo/ and lists it once in info/exclude, however often it runs', async () => {
  const context = await setup();
  for (let round = 0; round < 2; round += 1) {
    const result = await runPlan(context, [{}], ['--max-iterations', '1']);
    assert.ok(result.stdout.includes('Details: '), result.stdout + result.stderr);
    assert.equal(git(context.root, 'status', '--porcelain', '--untracked-files=all'), '');
  }
  const exclude = await fs.readFile(path.join(context.root, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude.split('\n').filter((line) => line === '.exo/').length, 1);
});

test('iteration cap: --max-iterations 1 spawns once and stops on the cap', async () => {
  const context = await setup();
  const result = await runPlan(context, [{}], ['--max-iterations', '1']);
  assert.equal(result.stop, 'run-plan: stop: iteration cap 1 reached, 0/2 landed');
  assert.equal(result.code, 1);
  assert.equal(result.calls.length, 1);
});

test('no progress: two iterations without a landing stop, and the retry names the failed attempt', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ result: 'Ran out of ideas.' }, {}]);
  assert.match(result.stop, /^run-plan: stop: no progress on task 1 in 2 iterations, log .+iter-2-task-1\.log$/);
  assert.equal(result.calls.length, 2);
  assert.match(result.calls[1].stdin, /Ran out of ideas\./);
});

test('no progress: a hanging process is killed at the timeout and counts as no progress', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ hang: true }, { hang: true }], ['--timeout', '0.01']);
  assert.match(result.stop, /^run-plan: stop: no progress on task 1 in 2 iterations/);
  assert.equal(result.calls.length, 2);
});

test('blocked: a last line Task 1: BLOCKED gets one repair session, and a repair that leaves the plan unchanged stops the run', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ result: 'Looked.\nTask 1: BLOCKED the data shape is open' }]);
  assert.equal(result.stop, 'run-plan: stop: task 1 blocked: the data shape is open; re-plan with exo:spec');
  assert.equal(result.calls.length, 2);
  assert.match(result.calls[1].stdin, /Plan repair of task 1/);
  assert.match(result.stdout, /task 1 repair rejected/);
});

test('blocked: a BLOCKED task\'s edits are saved to a patch and the tree is left clean', async () => {
  const context = await setup();
  const wrapper = path.join(context.tools, 'edits.mjs');
  await fs.writeFile(wrapper, [
    "import { execFileSync } from 'node:child_process';",
    "import fs from 'node:fs';",
    "fs.writeFileSync('a.txt', 'x\\n');",
    "execFileSync('git', ['add', 'a.txt']);",
    `await import(${JSON.stringify(context.stub)});`,
    ''
  ].join('\n'));
  context.stub = wrapper;
  const result = await runPlan(context, [{ result: 'Task 1: BLOCKED the data shape is open' }]);
  assert.equal(result.stop, 'run-plan: stop: task 1 blocked: the data shape is open; re-plan with exo:spec');
  assert.equal(git(context.root, 'status', '--porcelain', '--untracked-files=no'), '');
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  assert.match(await fs.readFile(path.join(logDir, 'task-1-leftover.patch'), 'utf8'), /a\.txt/);
  assert.match(result.stdout, /task 1 leftover saved to .*task-1-leftover\.patch/);
});

const denial ={ tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'npm install left-pad' } };

const deniedLine = /^  iteration 1, task 1: npm install left-pad$/m;

test('denied: a denial in a run that lands its task is logged and the loop goes on to the next task', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ ...land(1), denials: [denial] }, land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  assert.deepEqual(result.calls.map((call) => call.pin), ['plan/1', 'plan/2']);
  const summary = await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8');
  assert.match(summary, deniedLine);
});

test('denied: two runs with only denials and no landing stop on no progress', async () => {
  const context = await setup();
  const second = { ...denial, tool_use_id: 'toolu_2' };
  const result = await runPlan(context, [{ denials: [denial] }, { denials: [second] }]);
  assert.match(result.stop, /^run-plan: stop: no progress on task 1 in 2 iterations, log .+iter-2-task-1\.log$/);
  assert.equal(result.calls.length, 2);
  const detail = await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8');
  assert.match(detail, deniedLine);
  assert.match(detail, /^  iteration 2, task 1: npm install left-pad$/m);
  assert.match(detail, /^Denied: 2 commands /m);
  assert.match(result.stdout, /^2 commands were refused by the permission rules; the detail file lists them\.$/m);
  assert.doesNotMatch(result.stdout, /left-pad/);
  assert.match(result.stdout, /^\[\d\d:\d\d:\d\d\] task 1 failed: /m);
  assert.match(result.stdout, /^Not landed: tasks 1, 2\. Task 1 did not land in 2 tries\.$/m);
});

test('denied: a long denied command is cut to 120 characters in the detail file', async () => {
  const context = await setup();
  const long = { ...denial, tool_input: { command: `echo ${'x'.repeat(400)}` } };
  const result = await runPlan(context, [{ denials: [long], result: 'Task 1: BLOCKED denied' }]);
  const detail = await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8');
  const line = detail.split('\n').find((entry) => entry.startsWith('  iteration 1, task 1: echo'));
  assert.ok(line.endsWith('...') && line.length < 160, line);
  assert.match(result.stdout, /^\[\d\d:\d\d:\d\d\] task 1 blocked: denied$/m);
});

test('denied: a denial is logged and the BLOCKED line it caused stops the run', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ denials: [denial], result: 'Tried.\nTask 1: BLOCKED Bash permission denied in don\'t-ask mode' }]);
  assert.equal(result.stop, 'run-plan: stop: task 1 blocked: Bash permission denied in don\'t-ask mode; re-plan with exo:spec');
  assert.match(await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8'), deniedLine);
});

test('breach: one iteration landing two tasks is an extra commit', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ commits: [land(1).commits[0], land(2).commits[0]] }]);
  assert.equal(result.stop, 'run-plan: stop: breach in iteration 1: extra commit');
  assert.equal(result.code, 1);
});

test('breach: a push to the remote moves a remote ref', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ push: true }]);
  assert.equal(result.stop, 'run-plan: stop: breach in iteration 1: remote ref moved');
});

test('exo not loaded: a plugin error for exo in the init event stops the run', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ pluginError: 'hooks failed to load' }]);
  assert.equal(result.stop, 'run-plan: stop: exo not loaded: hooks failed to load');
});

test('exo not loaded: the child is killed at the init event, not left to run or time out', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ pluginError: 'hooks failed to load', hang: true }], ['--timeout', '1']);
  assert.equal(result.stop, 'run-plan: stop: exo not loaded: hooks failed to load');
  assert.doesNotMatch(result.stdout, /timed out/);
});

test('breach: a process that edits the plan stops the run and leaves the edit in place', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ ...land(1), editPlan: true }, land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: breach in iteration 1: plan changed', result.stdout + result.stderr);
  assert.equal(result.code, 1);
  assert.equal(result.calls.length, 1);
  assert.match(await fs.readFile(context.plan, 'utf8'), /- Proof: node -e 1\n$/);
});
