// Shared by the run-plan tests: the stub claude, the plan text, the temp
// repository (feature branch, local bare remote) they run against, and runPlan
// with the argv helpers that read back what the runner passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './clean-run-env.mjs';
import { fixture, git, gitRepository, run } from './harness.mjs';

// The stub: one step of the scenario per call, chosen by how many calls the
// record already holds. A step may land tasks (one commit per entry, each
// carrying the trailers listed), push the branch, edit the plan, hang, report
// denials or a plugin error, and end on one or two result events.
export const STUB = `
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const scenario = JSON.parse(fs.readFileSync(process.env.STUB_SCENARIO, 'utf8'));
const record = process.env.STUB_RECORD;
const stdin = fs.readFileSync(0, 'utf8');
const index = fs.existsSync(record) ? fs.readFileSync(record, 'utf8').split('\\n').filter(Boolean).length : 0;
fs.appendFileSync(record, JSON.stringify({ argv: process.argv.slice(2), stdin, pin: process.env.EXO_RUN_TASK ?? null, marker: process.env.CLAUDECODE ?? null,
  env: Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(ANTHROPIC_|CLAUDE_CODE_EFFORT_LEVEL$|CLAUDE_CODE_ALWAYS_ENABLE_EFFORT$|API_TIMEOUT_MS$|MSBUILDDISABLENODEREUSE$)/.test(name))) }) + '\\n');
const step = scenario.steps[index] ?? {};
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
const init = { type: 'system', subtype: 'init', cwd: process.cwd(), session_id: 'session-1', permissionMode: 'dontAsk',
  plugins: [{ name: 'exo', path: scenario.pluginPath, source: 'exo@local', version: '0.0.0' }] };
if (step.pluginError) init.plugin_errors = [{ plugin: 'exo', type: 'generic-error', message: step.pluginError }];
emit(init);
for (let hook = 0; hook < (step.hooks ?? 0); hook += 1) emit({ type: 'system', subtype: 'hook_started', hook_event: 'SessionStart' });
const git = (...args) => execFileSync('git', ['-c', 'user.name=stub', '-c', 'user.email=stub@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
for (const commit of step.commits ?? []) {
  fs.writeFileSync(commit.file, String(index) + '\\n');
  for (const extra of commit.also ?? []) fs.writeFileSync(extra, 'test\\n');
  git('add', commit.file, ...(commit.also ?? []));
  git('commit', '-q', '-m', commit.subject ?? 'feat: stub', ...commit.trailers.flatMap((trailer) => ['-m', trailer]));
}
for (const edit of step.edits ?? []) fs.appendFileSync(edit, 'edited\\n');
for (const [file, text] of Object.entries(step.appends ?? {})) fs.appendFileSync(file, text);
const findings = step.findings === undefined ? null : stdin.match(/^- Findings path: (.+)$/m)?.[1];
if (findings) { fs.mkdirSync(path.dirname(findings), { recursive: true }); fs.writeFileSync(findings, step.findings); }
if (step.push) git('push', '-q', 'origin', 'HEAD');
if (step.editPlan) fs.appendFileSync(scenario.planPath, '- Proof: node -e 1\\n');
if (step.hang) setInterval(() => {}, 1000);
else {
  const result = (text, turns, cost, denials) => ({ type: 'result', subtype: 'success', is_error: false, num_turns: turns,
    total_cost_usd: cost, permission_denials: denials, result: text, session_id: 'session-1' });
  if (step.usage) emit({ type: 'assistant', message: { usage: step.usage } });
  if (step.background) emit(result('Started a background agent.', 1, 0.01, []));
  emit(result(step.result ?? 'Worked on it.', 2, 0.02, step.denials ?? []));
}
`;

export const planText = (root, { allow = 'Allow: none', branch = 'feat/run', gate = 'none', land = 'Land: local', open = null, risk = null, success = '`node --version`', successRed = 'Red: none (fixture)' } = {}) => [
  '# Plan: runner fixture',
  '',
  '## Goal',
  'Two files exist.',
  '',
  '## Plan basis',
  `Repository: ${root}`,
  `Branch: ${branch}`,
  land,
  'Worktree setup: none',
  `Land gate: ${gate}`,
  'Lint: none',
  allow,
  '',
  '## Success criterion',
  success,
  successRed,
  '',
  '## Checkpoint',
  '- Blocks first: Task 1.',
  '- Parallel: none.',
  '- Shared state: none.',
  '- Smallest safe split: one file per task.',
  '',
  '## Manual checks',
  '- Open both files.',
  '',
  open,
  '',
  '## Tasks',
  '### Task 1: feat(a): add a',
  `Depends on: none | Files: \`a.txt\`${risk === null ? '' : ', `a.test.mjs`'} | Data: a line${risk === null ? '' : ` | Risk: ${risk}`} | Proof: node --version | Red: none (fixture)`,
  '### Task 2: feat(b): add b',
  'Depends on: 1 | Files: `b.txt` | Data: a line | Proof: node --version | Red: none (fixture)',
  ''
].filter((line) => line !== null).join('\n');

/** A repository whose main holds the plan, checked out on feat/run, with a bare origin holding main. */
export async function setup(options = {}) {
  const root = await gitRepository({ 'README.md': 'fixture\n' });
  await fs.mkdir(path.join(root, 'docs'));
  const plan = path.join(root, 'docs', 'plan.md');
  await fs.writeFile(plan, planText(root, options));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const bare = await fs.realpath(await fixture());
  git(bare, 'init', '-q', '--bare');
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', 'origin', 'main');
  git(root, 'fetch', '-q', 'origin');
  git(root, 'switch', '-q', '-c', 'feat/run');
  const tools = await fixture();
  const stub = path.join(tools, 'claude.mjs');
  await fs.writeFile(stub, STUB);
  const home = await fixture();
  await fs.mkdir(path.join(home, '.config', 'exo'), { recursive: true });
  await fs.writeFile(path.join(home, '.config', 'exo', 'keys.env'), `DEEPSEEK_API_KEY=${FAKE_KEYS.deepseek}\nZAI_API_KEY=${FAKE_KEYS.zai}\n`);
  return { root, plan, bare, tools, stub, home, env: {} };
}

export const FAKE_KEYS = { deepseek: 'fake-deepseek-key-1f3a', zai: 'fake-zai-key-9c7e' };

export const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

export const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));

export async function runPlan(context, steps, args = []) {
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: context.pluginPath ?? PLUGIN_ROOT, planPath: context.plan, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, ...(args.includes('--session') ? [] : ['--session', 'task']), ...args], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home, ...context.env }
  });
  const text = await fs.readFile(record, 'utf8').catch(() => '');
  const calls = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  for (const call of calls) {
    const mode = call.argv.indexOf('--permission-mode');
    assert.equal(call.argv[mode + 1], 'dontAsk');
    assert.ok(!call.argv.includes('--bare'));
    assert.ok(call.argv.includes('--strict-mcp-config'), 'a session loads no MCP servers');
    assert.ok(!call.argv.includes('--mcp-config'));
    assert.equal(call.marker, null, 'the running session marker is not passed on');
  }
  // The terminal ends on a short summary; the stop line closes the detail file it names.
  const detail = result.stdout.match(/^Details: (.+)$/m)?.[1];
  const lines = (detail === undefined ? result.stdout : await fs.readFile(detail, 'utf8')).trim().split('\n');
  return { ...result, calls, stop: lines.at(-1) };
}

export const allowOf = (call) => call.argv.slice(call.argv.indexOf('--allowedTools') + 1, call.argv.indexOf('--disallowedTools'));

export const settingsOf = (call) => (call.argv.includes('--settings') ? JSON.parse(call.argv[call.argv.indexOf('--settings') + 1]) : null);

export const SCRIPTS = path.join(PLUGIN_ROOT, 'skills', 'build', 'scripts');

export const SANDBOX_RULE = /^- Bash runs in a sandbox\. A command that fails with "Operation not permitted" or EPERM hit the sandbox/m;

export const sandboxOff = (context) => fs.writeFile(path.join(context.home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { sandbox: { enabled: false } } }));

/** The allowlist with the sandbox off: the plan's commands, read-only git and inspection. */
export function assertPlanAllowlist(call) {
  const allow = allowOf(call);
  assert.ok(allow.includes('Bash(node --version *)'));
  assert.ok(allow.includes('Bash(git status *)'));
  for (const command of ['ls', 'cat', 'grep', 'head', 'tail', 'wc', 'sed -n']) {
    for (const rule of [`Bash(${command})`, `Bash(${command} *)`]) assert.ok(allow.includes(rule), rule);
  }
  for (const rule of ['Bash(sed *)', 'Bash(sed)', 'Bash(python3 *)', 'Bash(find *)']) assert.ok(!allow.includes(rule), rule);
}

export const land = (number) => ({ commits: [{ file: number === 1 ? 'a.txt' : 'b.txt', trailers: [`Plan-task: plan/${number}`] }] });

export const SPAWN_ONCE = ['--max-iterations', '1'];
