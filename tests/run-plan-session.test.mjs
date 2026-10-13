// run-plan.mjs session child: providers, models and effort, the child env,
// resolving claude, parsing the stream and the --max-run-usd ledger.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { childEnv, parseStream, resolveClaude } from '../skills/build/scripts/run-session.mjs';
import { run } from './harness.mjs';
import { FAKE_KEYS, setup, runPlan, land, SPAWN_ONCE } from './run-plan-fixture.mjs';

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
  assert.equal(env.DOTNET_CLI_TELEMETRY_OPTOUT, '1');
  assert.equal(env.DOTNET_NOLOGO, '1');
  assert.equal(env.MSBUILDDISABLENODEREUSE, '1');
  assert.equal(env.DOTNET_CLI_USE_MSBUILD_SERVER, '0');
  assert.equal(env.BASH_MAX_TIMEOUT_MS, process.env.BASH_MAX_TIMEOUT_MS, 'no Bash cap is added');
  assert.equal(process.env.ANTHROPIC_API_KEY, 'fake-anthropic-key-5b2d');
  assert.equal(process.env.ANTHROPIC_AUTH_TOKEN, before.ANTHROPIC_AUTH_TOKEN);
  assert.equal(process.env.CLAUDE_CODE_EFFORT_LEVEL, before.CLAUDE_CODE_EFFORT_LEVEL);
  if (before.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = before.ANTHROPIC_API_KEY;
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

test('parseStream reads the model from init and sums input, cache and output tokens', () => {
  const usage = (counts) => ({ type: 'assistant', message: { usage: counts } });
  const first = { input_tokens: 10, cache_read_input_tokens: 2000, cache_creation_input_tokens: 300, output_tokens: 40 };
  const second = { input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0, output_tokens: 7 };
  const events = [{ type: 'system', subtype: 'init', model: 'claude-opus-5-5' }, usage(first), usage(second)];
  const parsed = parseStream(events.map((event) => JSON.stringify(event)).join('\n'));
  assert.equal(parsed.model, 'claude-opus-5-5');
  assert.equal(parsed.tokens, 2462);
  assert.equal(parseStream('').model, null);
  assert.equal(parseStream('').tokens, 0);
});

test('--max-run-usd: the ledger holds one line per session and the run stops before a session once the cap is spent', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ ...land(1), hooks: 2 }, land(2)], ['--max-run-usd', '0.03']);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0].argv[result.calls[0].argv.indexOf('--max-budget-usd') + 1], '0.03');
  assert.equal(result.calls[1].argv[result.calls[1].argv.indexOf('--max-budget-usd') + 1], '0.01');
  const capped = await setup();
  const stopped = await runPlan(capped, [{ ...land(1), hooks: 2 }, land(2)], ['--max-run-usd', '0.02', '--max-budget-usd', '5']);
  assert.equal(stopped.calls.length, 1);
  assert.equal(stopped.calls[0].argv[stopped.calls[0].argv.indexOf('--max-budget-usd') + 1], '0.02');
  assert.equal(stopped.stop, 'run-plan: stop: budget: $0.02 of $0.02');
  const logDir = path.dirname(stopped.stdout.match(/^Details: (.+)$/m)[1]);
  const lines = (await fs.readFile(path.join(logDir, 'sessions.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines, [{ kind: 'task', task: 1, sessionId: 'session-1', costUsd: 0.02, hooks: 2 }]);
});
