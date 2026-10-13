// run-plan.mjs before and around the loop: worktree roots, refusals, the dry
// run, the sandbox settings and allowlist, and the run-plan skill.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { allowRules, REGISTRY_DOMAINS, sandboxMode, sandboxSettings } from '../skills/build/scripts/run-session.mjs';
import { parsePlan } from '../lib/plan-tasks.mjs';
import { fixture, git, run } from './harness.mjs';
import { planText, setup, PLUGIN_ROOT, runPlan, allowOf, settingsOf, SCRIPTS, SANDBOX_RULE, sandboxOff, assertPlanAllowlist, land } from './run-plan-fixture.mjs';

test('worktree: a run rooted in a linked worktree lands there while the main checkout stays on main', async () => {
  const context = await setup();
  git(context.root, 'switch', '-q', 'main');
  const tree = path.join(context.root, '.worktrees', 'run');
  git(context.root, 'worktree', 'add', '-q', tree, 'feat/run');
  const linked = { ...context, root: tree, plan: path.join(tree, 'docs', 'plan.md') };
  const result = await runPlan(linked, [land(1), { ...land(2), background: true }, { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  assert.equal(git(context.root, 'branch', '--show-current').trim(), 'main');
  assert.equal(git(tree, 'branch', '--show-current').trim(), 'feat/run');
  assert.equal(await fs.readFile(path.join(tree, 'b.txt'), 'utf8'), '1\n');
  await assert.rejects(fs.access(path.join(context.root, 'a.txt')));
});

test('loads from: a session whose exo path is another checkout stops the run naming both paths', async () => {
  const context = await setup();
  context.pluginPath = await fs.realpath(await fixture());
  const result = await runPlan(context, [land(1)]);
  assert.equal(result.stop, `run-plan: stop: exo not loaded: exo loads from ${context.pluginPath}, not ${PLUGIN_ROOT}`);
});

test('refused: the default branch, a tracked change, a failing plan-check and a missing claude exit 2 with no spawn', async () => {
  const onMain = await setup();
  git(onMain.root, 'switch', '-q', 'main');
  const onDefault = await setup({ branch: 'main' });
  git(onDefault.root, 'switch', '-q', 'main');
  const changed = await setup();
  await fs.writeFile(path.join(changed.root, 'README.md'), 'edited\n');
  const badGate = await setup({ gate: 'node --version > out.txt' });
  const openPoint = await setup({ open: '## Open points\n- Which tone?' });
  const noClaude = await setup();
  noClaude.stub = path.join(noClaude.tools, 'missing.mjs');
  for (const [context, why] of [[onMain, /branch/], [onDefault, /is the default branch/], [changed, /tracked change in the checkout: README\.md;/], [badGate, /plan-check/], [openPoint, /plan-check/], [noClaude, /claude/]]) {
    const result = await runPlan(context, [land(1)]);
    assert.match(result.stop, /^run-plan: refused: /);
    assert.match(result.stop, why);
    assert.equal(result.code, 2);
    assert.equal(result.calls.length, 0);
  }
});

test('dry run prints the order, the rules and the first prompt and spawns nothing', async () => {
  const context = await setup();
  const result = await runPlan(context, [land(1)], ['--dry-run']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 0);
  assert.match(result.stdout, /Order: Task 1, Task 2/);
  assert.match(result.stdout, /^First prompt: Land Task 1 of .*plan\.md in this session\./m);
  assert.doesNotMatch(result.stdout, /land-task\.mjs" --plan .* --task 1/, 'the first prompt carries no land command');
  assert.match(result.stdout, /--tools Read,Edit,Write,Bash,Grep,Glob .*--disable-slash-commands --include-hook-events --allowedTools/);
  const withPlugin = await runPlan(context, [land(1)], ['--dry-run', '--plugin-dir', '/tmp/exo-plugin']);
  assert.match(withPlugin.stdout, /--plugin-dir \/tmp\/exo-plugin /);
  assert.ok(result.stdout.includes(`\nSandbox: on, writes in ${context.root}, network: ${REGISTRY_DOMAINS.join(', ')}\n`), result.stdout);
  assert.match(result.stdout, /--settings <sandbox settings>/);
  assert.doesNotMatch(result.stdout, /Bash\(git status \*\)|Bash\(node --version \*\)/);
  await sandboxOff(context);
  const off = await runPlan(context, [land(1)], ['--dry-run']);
  assert.match(off.stdout, /^Sandbox: off \(sandbox\.enabled is false in run\.json\)$/m);
  assert.match(off.stdout, /^  Bash\(git status \*\)$/m);
  assert.doesNotMatch(off.stdout, /--settings/);
});

test('sandbox: every process gets sandbox settings excluding only exo\'s gate scripts, and no Bash rule for sandboxed commands', async () => {
  const context = await setup();
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  const landTask = path.join(SCRIPTS, 'land-task.mjs');
  const verify = path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs');
  for (const [index, call] of result.calls.entries()) {
    const { sandbox } = settingsOf(call);
    assert.equal(sandbox.enabled, true);
    assert.equal(sandbox.allowUnsandboxedCommands, false);
    assert.equal(Boolean(settingsOf(call).hooks?.PreToolUse), index < 2, 'the stall hook is set in task sessions only, not the tail');
    assert.equal(sandbox.failIfUnavailable, true);
    assert.deepEqual(sandbox.network, { allowedDomains: REGISTRY_DOMAINS });
    for (const command of [`node "${landTask}"`, `node ${landTask}`]) assert.ok(sandbox.excludedCommands.includes(command), command);
    assert.equal(sandbox.excludedCommands.some((command) => command.includes('verify.mjs')), index === 2, 'verify.mjs is excluded only in the tail');
    const allow = allowOf(call);
    for (const rule of ['Bash(git status *)', 'Bash(node --version *)', 'Bash(ls *)', 'Bash(cat *)']) assert.ok(!allow.includes(rule), rule);
    assert.ok(!allow.some((rule) => rule.includes('next-task.mjs') || rule.includes('mcp-tool-call.mjs')));
    for (const rule of [`Bash(node "${landTask}" *)`, `Bash(node ${landTask} *)`, `Edit(/${context.root}/**)`]) assert.ok(allow.includes(rule), rule);
    assert.equal(allow.includes(`Bash(node ${verify} *)`), index === 2);
    assert.ok(call.argv.slice(call.argv.indexOf('--disallowedTools') + 1).includes('Bash(git push *)'));
  }
});

test('sandbox: run.json sandbox.enabled false keeps the plan allowlist, passes no settings and drops the sandbox rule', async () => {
  const context = await setup();
  await sandboxOff(context);
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  for (const call of result.calls) assert.deepEqual(Object.keys(settingsOf(call)), ['hooks']);
  assertPlanAllowlist(result.calls[0]);
  assert.ok(!allowOf(result.calls[0]).some((rule) => rule.includes('next-task.mjs') || rule.includes('mcp-tool-call.mjs')));
  assert.doesNotMatch(result.calls[0].stdin, SANDBOX_RULE);
});

test('sandbox: native Windows runs with the sandbox off and the same allowlist as sandbox.enabled false', async () => {
  const root = '/r';
  const planPath = '/r/docs/plan.md';
  const plan = parsePlan(planText(root));
  const windows = sandboxMode({ defaults: { sandbox: { enabled: true, allowedDomains: [] } } }, { platform: 'win32' });
  assert.deepEqual(windows, { enabled: false, reason: 'native Windows has no sandbox' });
  assert.equal(sandboxSettings(windows), null);
  assert.equal(sandboxSettings(windows, { tail: true }), null);
  assert.deepEqual(sandboxMode({ defaults: { sandbox: { enabled: false } } }, { platform: 'darwin' }), { enabled: false, reason: 'sandbox.enabled is false in run.json' });
  assert.deepEqual(sandboxMode({ defaults: { sandbox: { allowedDomains: ['registry.npmjs.org', 'example.com'] } } }, { platform: 'linux' }), { enabled: true, allowedDomains: [...REGISTRY_DOMAINS, 'example.com'] });
  const off = allowRules({ root, planPath, plan, sandbox: windows.enabled });
  assert.deepEqual(off, allowRules({ root, planPath, plan }));
  for (const rule of ['Bash(git status *)', 'Bash(node --version *)', 'Bash(ls)']) assert.ok(off.includes(rule), rule);
  assert.ok(!allowRules({ root, planPath, plan, sandbox: true }).includes('Bash(git status *)'));
});

test('refused: a wrong branch names the git switch that fixes it, with -c when the branch is missing', async () => {
  const missing = await setup({ branch: 'feat/other' });
  const existing = await setup();
  git(existing.root, 'switch', '-q', 'main');
  const first = await runPlan(missing, [land(1)]);
  assert.match(first.stop, /; run git switch -c feat\/other$/);
  const second = await runPlan(existing, [land(1)]);
  assert.match(second.stop, /; run git switch feat\/run$/);
});

test('the run-plan skill is user-only, takes a plan path and runs run-plan.mjs on it', async () => {
  const skill = await fs.readFile(path.join(PLUGIN_ROOT, 'skills', 'run-plan', 'SKILL.md'), 'utf8');
  assert.match(skill, /^name: run-plan$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /^argument-hint: "<plan path>"$/m);
  assert.match(skill, /run-plan\.mjs" <plan>/);
  const { EXPECTED_SKILLS } = await import('../verify/budgets.mjs');
  assert.ok(EXPECTED_SKILLS.includes('run-plan'));
});
