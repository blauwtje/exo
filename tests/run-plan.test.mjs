// run-plan.mjs against a temp repository with a two-task plan on a feature
// branch and a local bare remote. A stub claude, written here from the shapes
// of a `claude -p --output-format stream-json --verbose` stream with neutral
// values, plays one scenario step per spawn and records its argv, stdin and
// EXO_RUN_TASK, so each case asserts what the runner passed and how it stopped.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { childEnv, resolveClaude, parseStream } from '../skills/build/scripts/run-plan.mjs';
import { fixture, git, gitRepository, run } from './harness.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));

// The stub: one step of the scenario per call, chosen by how many calls the
// record already holds. A step may land tasks (one commit per entry, each
// carrying the trailers listed), push the branch, hang, report denials or a
// plugin error, and end on one or two result events.
const STUB = `
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const scenario = JSON.parse(fs.readFileSync(process.env.STUB_SCENARIO, 'utf8'));
const record = process.env.STUB_RECORD;
const stdin = fs.readFileSync(0, 'utf8');
const index = fs.existsSync(record) ? fs.readFileSync(record, 'utf8').split('\\n').filter(Boolean).length : 0;
fs.appendFileSync(record, JSON.stringify({ argv: process.argv.slice(2), stdin, pin: process.env.EXO_RUN_TASK ?? null, marker: process.env.CLAUDECODE ?? null,
  env: Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(ANTHROPIC_|CLAUDE_CODE_EFFORT_LEVEL$|CLAUDE_CODE_ALWAYS_ENABLE_EFFORT$|API_TIMEOUT_MS$)/.test(name))) }) + '\\n');
const step = scenario.steps[index] ?? {};
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
const init = { type: 'system', subtype: 'init', cwd: process.cwd(), session_id: 'session-1', permissionMode: 'dontAsk',
  plugins: [{ name: 'exo', path: scenario.pluginPath, source: 'exo@local', version: '0.0.0' }] };
if (step.pluginError) init.plugin_errors = [{ plugin: 'exo', type: 'generic-error', message: step.pluginError }];
emit(init);
const git = (...args) => execFileSync('git', ['-c', 'user.name=stub', '-c', 'user.email=stub@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
for (const commit of step.commits ?? []) {
  fs.writeFileSync(commit.file, String(index) + '\\n');
  git('add', commit.file);
  git('commit', '-q', '-m', 'feat: stub', ...commit.trailers.flatMap((trailer) => ['-m', trailer]));
}
if (step.push) git('push', '-q', 'origin', 'HEAD');
if (step.hang) setInterval(() => {}, 1000);
else {
  const result = (text, turns, cost, denials) => ({ type: 'result', subtype: 'success', is_error: false, num_turns: turns,
    total_cost_usd: cost, permission_denials: denials, result: text, session_id: 'session-1' });
  if (step.usage) emit({ type: 'assistant', message: { usage: step.usage } });
  if (step.background) emit(result('Started a background agent.', 1, 0.01, []));
  emit(result(step.result ?? 'Worked on it.', 2, 0.02, step.denials ?? []));
}
`;

const planText = (root, { allow = 'Allow: none', branch = 'feat/run', gate = 'none' } = {}) => [
  '# Plan: runner fixture',
  '',
  '## Goal',
  'Two files exist.',
  '',
  '## Plan basis',
  `Repository: ${root}`,
  `Branch: ${branch}`,
  'Worktree setup: none',
  `Land gate: ${gate}`,
  'Lint: none',
  allow,
  '',
  '## Success criterion',
  '`node --version`',
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
  '## Tasks',
  '### Task 1: feat(a): add a',
  'Depends on: none | Files: `a.txt` | Data: a line | Proof: node --version',
  '### Task 2: feat(b): add b',
  'Depends on: 1 | Files: `b.txt` | Data: a line | Proof: node --version',
  ''
].filter((line) => line !== null).join('\n');

/** A repository whose main holds the plan, checked out on feat/run, with a bare origin holding main. */
async function setup(options = {}) {
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

const FAKE_KEYS = { deepseek: 'fake-deepseek-key-1f3a', zai: 'fake-zai-key-9c7e' };

async function runPlan(context, steps, args = []) {
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, ...args], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home, ...context.env }
  });
  const text = await fs.readFile(record, 'utf8').catch(() => '');
  const calls = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  for (const call of calls) {
    const mode = call.argv.indexOf('--permission-mode');
    assert.equal(call.argv[mode + 1], 'dontAsk');
    assert.ok(!call.argv.includes('--bare'));
    assert.equal(call.marker, null, 'the running session marker is not passed on');
  }
  const lines = result.stdout.trim().split('\n');
  return { ...result, calls, stop: lines.at(-1) };
}

const land = (number) => ({ commits: [{ file: number === 1 ? 'a.txt' : 'b.txt', trailers: [`Plan-task: plan/${number}`] }] });

test('done: two task processes and the tail land the plan, the gate passes and the remote is untouched', async () => {
  const context = await setup();
  const remoteBefore = git(context.bare, 'for-each-ref');
  const result = await runPlan(context, [land(1), { ...land(2), background: true }, { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  assert.equal(result.code, 0);
  assert.equal(result.calls.length, 3);
  assert.deepEqual(result.calls.map((call) => call.pin), ['plan/1', 'plan/2', null]);
  assert.match(result.calls[0].stdin, /^\/exo:build .*plan\.md --task 1/);
  assert.match(result.calls[2].stdin, /^\/exo:verify .*plan\.md Push nothing and open no pull request\./);
  const deny = result.calls[0].argv.slice(result.calls[0].argv.indexOf('--disallowedTools') + 1);
  for (const rule of ['Bash(git push *)', 'Bash(gh *)', 'Bash(git commit *)', 'Bash(node *settings.mjs*)']) assert.ok(deny.includes(rule), rule);
  assert.ok(result.calls[0].argv.includes(`Edit(/${context.root}/**)`));
  assert.ok(result.calls[0].argv.includes('Bash(node --version *)'));
  const mcpCheck = path.join(PLUGIN_ROOT, 'lib', 'mcp-tool-call.mjs');
  for (const rule of [`Bash(node "${mcpCheck}" *)`, `Bash(node ${mcpCheck} *)`]) assert.ok(result.calls[0].argv.includes(rule), rule);
  assert.equal(git(context.bare, 'for-each-ref'), remoteBefore);
  const summary = await fs.readFile(path.join(result.stdout.match(/^Logs: (.+)$/m)[1], 'summary.txt'), 'utf8');
  assert.match(summary, /Task 1: [0-9a-f]{7,}/);
  assert.match(summary, /Open both files\./);
  assert.equal(summary.trim().split('\n').at(-1), result.stop);
  const logDir = result.stdout.match(/^Logs: (.+)$/m)[1];
  const tasks = JSON.parse(await fs.readFile(path.join(logDir, 'tasks.json'), 'utf8'));
  assert.deepEqual(tasks.map((task) => [task.number, task.passes]), [[1, true], [2, true]]);
  const progress = await fs.readFile(path.join(logDir, 'progress.md'), 'utf8');
  assert.match(progress, /Task 1: landed/);
  assert.equal(progress.trim().split('\n').at(-1), 'RUN COMPLETE');
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
  assert.match(result.stdout, /^Task 1: .*, peak context 72k$/m);
  assert.match(result.stdout, /^Task 2: .*, peak context 22k$/m);
  assert.match(result.stdout, /^Task 1: peak context 72k is over the 60k budget; split similar tasks next time$/m);
  assert.doesNotMatch(result.stdout, /Task 2: peak context .* is over/);
});

test('progress: a capped run flips no task and writes no RUN COMPLETE', async () => {
  const context = await setup();
  const result = await runPlan(context, [{}], ['--max-iterations', '1']);
  const logDir = result.stdout.match(/^Logs: (.+)$/m)[1];
  const tasks = JSON.parse(await fs.readFile(path.join(logDir, 'tasks.json'), 'utf8'));
  assert.deepEqual(tasks.map((task) => task.passes), [false, false]);
  assert.doesNotMatch(await fs.readFile(path.join(logDir, 'progress.md'), 'utf8'), /RUN COMPLETE/);
});

test('scratch: the run leaves no untracked .exo/ and lists it once in info/exclude, however often it runs', async () => {
  const context = await setup();
  for (let round = 0; round < 2; round += 1) {
    const result = await runPlan(context, [{}], ['--max-iterations', '1']);
    assert.ok(result.stdout.includes('Logs: '), result.stdout + result.stderr);
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

test('blocked: a last line Task 1: BLOCKED stops after one spawn', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ result: 'Looked.\nTask 1: BLOCKED the data shape is open' }]);
  assert.equal(result.stop, 'run-plan: stop: task 1 blocked: the data shape is open; re-plan with exo:spec');
  assert.equal(result.calls.length, 1);
});

const denial = { tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'npm install left-pad' } };
const deniedLine = /^Denied in iteration 1, task 1: npm install left-pad; add it to Allow: if the task needs it$/m;

test('denied: a denial in a run that lands its task is logged and the loop goes on to the next task', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ ...land(1), denials: [denial] }, land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout + result.stderr);
  assert.deepEqual(result.calls.map((call) => call.pin), ['plan/1', 'plan/2', null]);
  const summary = await fs.readFile(path.join(result.stdout.match(/^Logs: (.+)$/m)[1], 'summary.txt'), 'utf8');
  assert.match(summary, deniedLine);
});

test('denied: two runs with only denials and no landing stop on no progress', async () => {
  const context = await setup();
  const second = { ...denial, tool_use_id: 'toolu_2' };
  const result = await runPlan(context, [{ denials: [denial] }, { denials: [second] }]);
  assert.match(result.stop, /^run-plan: stop: no progress on task 1 in 2 iterations, log .+iter-2-task-1\.log$/);
  assert.equal(result.calls.length, 2);
  assert.match(result.stdout, deniedLine);
  assert.match(result.stdout, /^Denied in iteration 2, task 1: npm install left-pad;/m);
});

test('denied: a denial is logged and the BLOCKED line it caused stops the run', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ denials: [denial], result: 'Tried.\nTask 1: BLOCKED Bash permission denied in don\'t-ask mode' }]);
  assert.equal(result.stop, 'run-plan: stop: task 1 blocked: Bash permission denied in don\'t-ask mode; re-plan with exo:spec');
  assert.match(result.stdout, deniedLine);
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

test('refused: the default branch, a tracked change, a failing plan-check and a missing claude exit 2 with no spawn', async () => {
  const onMain = await setup();
  git(onMain.root, 'switch', '-q', 'main');
  const onDefault = await setup({ branch: 'main' });
  git(onDefault.root, 'switch', '-q', 'main');
  const changed = await setup();
  await fs.writeFile(path.join(changed.root, 'README.md'), 'edited\n');
  const badGate = await setup({ gate: 'node --version > out.txt' });
  const noClaude = await setup();
  noClaude.stub = path.join(noClaude.tools, 'missing.mjs');
  for (const [context, why] of [[onMain, /branch/], [onDefault, /is the default branch/], [changed, /tracked change in the checkout: README\.md;/], [badGate, /plan-check/], [noClaude, /claude/]]) {
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
  assert.match(result.stdout, /--task 1/);
});

const SPAWN_ONCE = ['--max-iterations', '1'];
const lastCall = (result) => result.calls.at(-1);

test('provider: each provider sends its model, env and the mapped effort for every level', async () => {
  const context = await setup();
  context.env = { ANTHROPIC_API_KEY: 'fake-anthropic-key-5b2d' };
  const mapped = {
    claude: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    deepseek: { low: 'high', medium: 'high', high: 'high', xhigh: 'max', max: 'max' },
    zai: { low: 'low', medium: 'high', high: 'high', xhigh: 'max', max: 'max' }
  };
  const models = { claude: 'sonnet', deepseek: 'deepseek-flash', zai: 'glm-5.3' };
  for (const [provider, levels] of Object.entries(mapped)) {
    for (const [asked, sent] of Object.entries(levels)) {
      const call = lastCall(await runPlan(context, [{}], [...SPAWN_ONCE, '--provider', provider, '--effort', asked]));
      assert.equal(call.argv[call.argv.indexOf('--effort') + 1], sent, `${provider} ${asked}`);
      assert.equal(call.argv[call.argv.indexOf('--model') + 1], models[provider]);
      assert.equal(call.env.CLAUDE_CODE_EFFORT_LEVEL, sent, `${provider} ${asked}`);
      if (provider === 'claude') {
        assert.equal(call.env.ANTHROPIC_API_KEY, 'fake-anthropic-key-5b2d');
        assert.equal(call.env.ANTHROPIC_AUTH_TOKEN, undefined);
        assert.equal(call.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT, undefined);
      } else {
        assert.equal(call.env.ANTHROPIC_API_KEY, undefined, 'an Anthropic key never reaches another host');
        assert.equal(call.env.ANTHROPIC_AUTH_TOKEN, FAKE_KEYS[provider]);
        assert.equal(call.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT, '1');
        assert.equal(call.env.ANTHROPIC_MODEL, models[provider]);
      }
    }
  }
  const zai = lastCall(await runPlan(context, [{}], [...SPAWN_ONCE, '--provider', 'zai']));
  assert.equal(zai.env.API_TIMEOUT_MS, '3000000');
  assert.equal(zai.env.ANTHROPIC_BASE_URL, 'https://api.z.ai/api/anthropic');
  const overridden = lastCall(await runPlan(context, [{}], [...SPAWN_ONCE, '--provider', 'zai', '--model', 'glm-other']));
  assert.equal(overridden.argv[overridden.argv.indexOf('--model') + 1], 'glm-other');
});

test('provider: the default is claude on sonnet at medium effort', async () => {
  const call = lastCall(await runPlan(await setup(), [{}], SPAWN_ONCE));
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'sonnet');
  assert.equal(call.argv[call.argv.indexOf('--effort') + 1], 'medium');
  assert.equal(call.env.CLAUDE_CODE_EFFORT_LEVEL, 'medium');
});

test('provider: one defined only in run.json runs, and run.json can change the default provider', async () => {
  const context = await setup();
  const local = { model: 'local-1', efforts: ['medium'], env: { ANTHROPIC_BASE_URL: 'http://localhost:9' } };
  await fs.writeFile(path.join(context.home, '.config', 'exo', 'run.json'), JSON.stringify({ providers: { local } }));
  const call = lastCall(await runPlan(context, [{}], [...SPAWN_ONCE, '--provider', 'local', '--effort', 'max']));
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'local-1');
  assert.equal(call.argv[call.argv.indexOf('--effort') + 1], 'medium');
  assert.equal(call.env.ANTHROPIC_BASE_URL, 'http://localhost:9');
  await fs.writeFile(path.join(context.home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { provider: 'zai' } }));
  const byDefault = lastCall(await runPlan(context, [{}], SPAWN_ONCE));
  assert.equal(byDefault.env.ANTHROPIC_AUTH_TOKEN, FAKE_KEYS.zai);
});

test('provider: a missing key, an unknown provider and an unknown effort exit 2 with no spawn', async () => {
  const context = await setup();
  await fs.rm(path.join(context.home, '.config', 'exo', 'keys.env'));
  for (const [args, why] of [[['--provider', 'deepseek'], /Missing key for deepseek.*DEEPSEEK_API_KEY=/], [['--provider', 'nope'], /Unknown provider "nope"/], [['--effort', 'ultra'], /unknown effort "ultra"/]]) {
    const result = await runPlan(context, [{}], args);
    assert.match(result.stop, /^run-plan: refused: /);
    assert.match(result.stop, why);
    assert.equal(result.code, 2);
    assert.equal(result.calls.length, 0);
  }
});

test('provider: no key value reaches stdout, the log directory or the dry run', async () => {
  const context = await setup();
  const logged = await runPlan(context, [{ result: 'Done.' }], [...SPAWN_ONCE, '--provider', 'deepseek']);
  const dry = await runPlan(context, [{}], ['--dry-run', '--provider', 'deepseek', '--effort', 'xhigh']);
  assert.match(dry.stdout, /^Provider: deepseek$/m);
  assert.match(dry.stdout, /^Model: deepseek-flash$/m);
  assert.match(dry.stdout, /^Effort: xhigh -> max$/m);
  assert.match(dry.stdout, /^  ANTHROPIC_AUTH_TOKEN=<from keys\.env>$/m);
  assert.match(dry.stdout, /^  ANTHROPIC_BASE_URL=https:\/\/api\.deepseek\.com\/anthropic$/m);
  assert.match(dry.stdout, /^Caps: 4 iterations, 60 minutes per session, 60000 tokens of context per task$/m);
  const texts = [logged.stdout, logged.stderr, dry.stdout, dry.stderr];
  const logs = path.join(context.root, '.exo', 'run-plan');
  for (const entry of await fs.readdir(logs, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) texts.push(await fs.readFile(path.join(entry.parentPath, entry.name), 'utf8'));
  }
  assert.ok(texts.length > 4, 'the log directory holds files');
  for (const text of texts) for (const key of Object.values(FAKE_KEYS)) assert.ok(!text.includes(key), `a key leaked: ${key}`);
});

test('childEnv: the runner changes only the copy it hands the child, never its own env', () => {
  const before = { ...process.env };
  process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key-5b2d';
  const env = childEnv('plan/1', { name: 'zai', effort: 'high', env: { ANTHROPIC_AUTH_TOKEN: 'fake-token' } });
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'fake-token');
  assert.equal(env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
  assert.equal(env.EXO_RUN_TASK, 'plan/1');
  assert.equal(process.env.ANTHROPIC_API_KEY, 'fake-anthropic-key-5b2d');
  assert.equal(process.env.ANTHROPIC_AUTH_TOKEN, before.ANTHROPIC_AUTH_TOKEN);
  assert.equal(process.env.CLAUDE_CODE_EFFORT_LEVEL, before.CLAUDE_CODE_EFFORT_LEVEL);
  if (before.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = before.ANTHROPIC_API_KEY;
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

test('resolveClaude finds claude.exe on Windows, refuses a .cmd-only PATH and a PATH without claude', () => {
  const files = new Set(['/bin/claude', 'C:\\npm\\claude.cmd', 'C:\\tools\\claude.exe']);
  const isFile = (file) => files.has(file);
  assert.deepEqual(resolveClaude({ pathValue: '/usr/x:/bin', platform: 'linux', isFile }), { command: '/bin/claude', prefix: [] });
  assert.equal(resolveClaude({ pathValue: 'C:\\npm;C:\\tools', platform: 'win32', isFile }).command, 'C:\\tools\\claude.exe');
  assert.match(resolveClaude({ pathValue: 'C:\\npm', platform: 'win32', isFile }).refused, /pass --claude/);
  assert.match(resolveClaude({ pathValue: '/usr/x', platform: 'linux', isFile }).refused, /no claude/);
  assert.deepEqual(resolveClaude({ flag: '/s/stub.mjs', isFile: () => true }), { command: process.execPath, prefix: ['/s/stub.mjs'] });
});

test('parseStream takes the last result, sums turns, keeps the last cost and unions denials', () => {
  const denial = (id) => ({ tool_name: 'Bash', tool_use_id: id, tool_input: { command: id } });
  const events = [
    { type: 'system', subtype: 'init', plugins: [] },
    { type: 'result', num_turns: 1, total_cost_usd: 0.1, permission_denials: [denial('a')], result: 'first' },
    { type: 'system', subtype: 'init', plugins: [] },
    { type: 'result', num_turns: 3, total_cost_usd: 0.3, permission_denials: [denial('a'), denial('b')], result: 'second' }
  ];
  const parsed = parseStream(`${events.map((event) => JSON.stringify(event)).join('\r\n')}\nnot json\n`);
  assert.equal(parsed.resultText, 'second');
  assert.equal(parsed.turns, 4);
  assert.equal(parsed.cost, 0.3);
  assert.deepEqual(parsed.denials.map((entry) => entry.tool_use_id), ['a', 'b']);
});

test('parseStream keeps the largest assistant context across input, cache read and cache creation', () => {
  const usage = (input, read, created) => ({ type: 'assistant', message: { usage: { input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: created } } });
  const parsed = parseStream([usage(10, 2000, 300), usage(5, 9000, 1000), usage(1, 100, 0)].map((event) => JSON.stringify(event)).join('\n'));
  assert.equal(parsed.peakContext, 10005);
  assert.equal(parseStream('').peakContext, 0);
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
