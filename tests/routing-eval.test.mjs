import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baselineProblem, costOfLine, descriptionHashes, dryRunLine, evaluate, gradeStream, medianCost, modelInvocableSkills, quickPrompts, routingHome, withBaseline } from '../benchmarks/routing.mjs';

const root = new URL('..', import.meta.url).pathname;
const line = (content) => JSON.stringify({ type: 'assistant', message: { content } });

test('grade takes the first tool_use: a Skill name, or none for another tool or no tool', () => {
  const skill = line([{ type: 'tool_use', name: 'Skill', input: { skill: 'exo:build' } }]);
  const bash = line([{ type: 'tool_use', name: 'Bash', input: {} }]);
  assert.equal(gradeStream(`{"type":"system"}\n${skill}\n${bash}`), 'build');
  assert.equal(gradeStream(`${bash}\n${skill}`), null);
  assert.equal(gradeStream(line([{ type: 'text', text: 'hi' }])), null);
});

test('evaluate writes cells, arms and per-arm per-split per-skill recall and false-trigger rate', async () => {
  const prompts = [
    { prompt: 'a', expect: 'build', split: 'train' },
    { prompt: 'b', expect: null, split: 'train' }
  ];
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook', 'no-hook'], runs: 2, concurrency: 2, skills: ['build', 'spec'],
    runSession: async ({ prompt, arm }) => (prompt === 'a' || arm === 'hook' ? 'build' : null)
  });
  assert.deepEqual(outcome.cells, ['sonnet:low']);
  assert.deepEqual(outcome.results['sonnet:low'].hook.train.build, { recall: 1, falseTrigger: 1 });
  assert.deepEqual(outcome.results['sonnet:low']['no-hook'].train.build, { recall: 1, falseTrigger: 0 });
  assert.equal(outcome.results['sonnet:low'].hook.train.spec.recall, null);
  assert.equal(outcome.sessions.length, 8);
});

test('descriptionHashes covers each model-invocable skill and session-routing', () => {
  const hashes = descriptionHashes(root);
  const skills = modelInvocableSkills(root);
  assert.ok(skills.includes('build') && !skills.includes('prompt'));
  assert.deepEqual(Object.keys(hashes).sort(), [...skills, 'session-routing'].sort());
  const routing = readFileSync(`${root}hooks/session-routing.md`, 'utf8');
  assert.equal(hashes['session-routing'], createHash('sha256').update(routing).digest('hex'));
  for (const value of Object.values(hashes)) assert.match(value, /^[0-9a-f]{64}$/);
});

test('a failed session is an error outcome: kept out of recall and false-trigger rates, counted per arm', async () => {
  const prompts = [
    { prompt: 'a', expect: 'build', split: 'train' },
    { prompt: 'b', expect: null, split: 'train' }
  ];
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook', 'no-hook'], runs: 2, concurrency: 2, skills: ['build'],
    runSession: async ({ prompt, arm }) => (arm === 'no-hook' ? { error: 'exit 1: login required' } : prompt === 'a' ? 'build' : null)
  });
  assert.deepEqual(outcome.results['sonnet:low']['no-hook'].train.build, { recall: null, falseTrigger: null });
  assert.deepEqual(outcome.results['sonnet:low'].hook.train.build, { recall: 1, falseTrigger: 0 });
  assert.deepEqual(outcome.errors['sonnet:low'], { hook: 0, 'no-hook': 4 });
  const failed = outcome.sessions.filter((session) => session.arm === 'no-hook');
  assert.ok(failed.every((session) => session.pick === null && session.error === 'exit 1: login required'));
});

test('a failed session in a partly failing arm leaves the rates to the sessions that ran', async () => {
  const prompts = [{ prompt: 'a', expect: 'build', split: 'train' }];
  let calls = 0;
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook'], runs: 4, concurrency: 1, skills: ['build'],
    runSession: async () => { calls += 1; return calls % 2 ? { error: 'timeout after 1ms' } : 'build'; }
  });
  assert.deepEqual(outcome.results['sonnet:low'].hook.train.build, { recall: 1, falseTrigger: null });
  assert.equal(outcome.errors['sonnet:low'].hook, 2);
});

test('each session record carries mode, cost_usd and durationMs; a plain pick leaves cost and duration null', async () => {
  const prompts = [{ prompt: 'a', expect: 'build', split: 'train' }];
  const outcome = await evaluate({
    prompts, cells: ['sonnet:low'], arms: ['hook', 'no-hook'], runs: 1, concurrency: 1, skills: ['build'],
    runSession: async ({ arm }) => (arm === 'hook' ? { pick: 'build', cost_usd: 0.02, durationMs: 1500 } : 'build')
  });
  const [hook, plain] = outcome.sessions;
  assert.deepEqual([hook.mode, hook.pick, hook.cost_usd, hook.durationMs], ['full', 'build', 0.02, 1500]);
  assert.deepEqual([plain.mode, plain.pick, plain.cost_usd, plain.durationMs], ['full', 'build', null, null]);
});

test('a failed session keeps its duration and records no cost', async () => {
  const outcome = await evaluate({
    prompts: [{ prompt: 'a', expect: 'build', split: 'train' }], cells: ['sonnet:low'], arms: ['hook'], runs: 1, concurrency: 1, skills: ['build'],
    runSession: async () => ({ error: 'timeout after 1ms', cost_usd: null, durationMs: 1 })
  });
  const [session] = outcome.sessions;
  assert.deepEqual([session.pick, session.error, session.cost_usd, session.durationMs], [null, 'timeout after 1ms', null, 1]);
});

test('costOfLine prices the usage of the picking event, and is null for an unlisted model or no usage', () => {
  const picking = (message) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'build' } }], ...message } });
  const listed = costOfLine(picking({ model: 'claude-sonnet-4-5', usage: { input_tokens: 1000, output_tokens: 100 } }));
  assert.ok(listed > 0 && listed < 0.1);
  assert.equal(costOfLine(picking({ model: 'unlisted-model', usage: { input_tokens: 1000, output_tokens: 100 } })), null);
  assert.equal(costOfLine(picking({ model: 'claude-sonnet-4-5' })), null);
});

test('medianCost ignores sessions without a cost; dryRunLine multiplies sessions by it or says cost unknown', () => {
  assert.equal(medianCost([{ cost_usd: 0.3 }, { cost_usd: null }, { cost_usd: 0.1 }, {}, { cost_usd: 0.2 }]), 0.2);
  assert.equal(medianCost([{ cost_usd: 0.1 }, { cost_usd: 0.3 }]), 0.2);
  assert.equal(medianCost([{ cost_usd: null }]), null);
  assert.equal(dryRunLine(10, [{ cost_usd: 0.05 }]), 'dry-run: 10 sessions x median $0.0500 = $0.50');
  assert.equal(dryRunLine(10, []), 'dry-run: 10 sessions, cost unknown');
});

test('--dry-run projects from the recorded --out file and starts no session', () => {
  const dir = mkdtempSync(join(tmpdir(), 'routing-dry-'));
  const out = join(dir, 'recorded.json');
  const dryRun = (...args) => spawnSync(process.execPath, [`${root}benchmarks/routing.mjs`, '--dry-run', '--full', '--cells', 'sonnet:low', '--arms', 'hook', '--runs', '1', '--split', 'held-out', '--out', out, ...args], { encoding: 'utf8' });
  const unknown = dryRun();
  assert.equal(unknown.status, 0);
  assert.match(unknown.stdout, /^dry-run: \d+ sessions, cost unknown\n$/);
  const count = Number(/dry-run: (\d+) sessions/.exec(unknown.stdout)[1]);
  writeFileSync(out, JSON.stringify({ sessions: [{ cost_usd: 0.01 }, { cost_usd: 0.03 }, { cost_usd: null }] }));
  const known = dryRun();
  assert.equal(known.status, 0);
  assert.equal(known.stdout, `dry-run: ${count} sessions x median $0.0200 = $${(count * 0.02).toFixed(2)}\n`);
});

const GOOD_STREAM = [
  JSON.stringify({ type: 'system' }),
  line([{ type: 'text', text: 'Routing.' }, { type: 'tool_use', name: 'Skill', input: { skill: 'exo:build' } }])
].join('\n');
const BAD_STREAMS = [
  line([{ type: 'tool_use', name: 'Bash', input: {} }]),
  line([{ type: 'tool_use', name: 'Skill', input: { skill: 'exo:spec' } }]),
  line([{ type: 'text', text: 'No skill needed.' }])
];

test('the scorer gives a good reference stream full recall and every bad reference stream none', async () => {
  const prompts = [{ prompt: 'a', expect: 'build', split: 'held-out' }];
  const recallOf = async (stream) => {
    const outcome = await evaluate({ prompts, cells: ['sonnet:low'], arms: ['hook'], runs: 1, concurrency: 1, skills: ['build'], runSession: async () => gradeStream(stream) });
    return outcome.results['sonnet:low'].hook['held-out'].build.recall;
  };
  assert.equal(await recallOf(GOOD_STREAM), 1);
  for (const stream of BAD_STREAMS) assert.equal(await recallOf(stream), 0);
});

test('quickPrompts keeps the first held-out prompt of each skill and the first four of none, in file order', () => {
  const entry = (expect, split, n) => ({ prompt: `${expect}-${split}-${n}`, expect, split });
  const all = [entry('build', 'train', 1), ...[1, 2, 3].map((n) => entry('build', 'held-out', n)), ...[1, 2, 3, 4, 5].map((n) => entry(null, 'held-out', n)), entry('spec', 'held-out', 1)];
  assert.deepEqual(quickPrompts(all).map((e) => e.prompt), ['build-held-out-1', 'null-held-out-1', 'null-held-out-2', 'null-held-out-3', 'null-held-out-4', 'spec-held-out-1']);
});

test('baselineProblem is null only when cells, prompts and every description hash match', () => {
  const current = { cells: ['sonnet:low'], prompts: ['a', 'b'], hashes: { build: 'x', 'session-routing': 'y' } };
  const baseline = structuredClone(current);
  assert.equal(baselineProblem(baseline, current), null);
  assert.equal(baselineProblem(null, current), 'missing');
  assert.equal(baselineProblem({ ...baseline, cells: ['opus:low'] }, current), 'cells differ');
  assert.equal(baselineProblem({ ...baseline, prompts: ['a'] }, current), 'prompts differ');
  assert.equal(baselineProblem({ ...baseline, hashes: { ...baseline.hashes, build: 'z' } }, current), 'hashes differ');
});

test('withBaseline adds the stored no-hook arm and its sessions to a live hook run', async () => {
  const prompts = [{ prompt: 'a', expect: 'build', split: 'held-out' }];
  const run = (arm, pick) => evaluate({ prompts, cells: ['sonnet:low'], arms: [arm], runs: 1, concurrency: 1, skills: ['build'], runSession: async () => pick, mode: 'quick' });
  const merged = withBaseline(await run('hook', 'build'), await run('no-hook', null));
  assert.deepEqual(merged.arms, ['hook', 'no-hook']);
  assert.equal(merged.results['sonnet:low'].hook['held-out'].build.recall, 1);
  assert.equal(merged.results['sonnet:low']['no-hook']['held-out'].build.recall, 0);
  assert.deepEqual(merged.errors['sonnet:low'], { hook: 0, 'no-hook': 0 });
  assert.deepEqual(merged.sessions.map((session) => session.arm), ['hook', 'no-hook']);
});

test('the default run is the quick set once; --write-baseline is the no-hook arm only; --full is every prompt three times in both arms', () => {
  const prompts = JSON.parse(readFileSync(`${root}benchmarks/routing/prompts.json`, 'utf8'));
  const quick = quickPrompts(prompts).length;
  const sessions = (...args) => {
    const result = spawnSync(process.execPath, [`${root}benchmarks/routing.mjs`, '--dry-run', '--out', join(mkdtempSync(join(tmpdir(), 'routing-count-')), 'none.json'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return Number(/dry-run: (\d+) sessions/.exec(result.stdout)[1]);
  };
  assert.equal(sessions('--arms', 'hook,no-hook'), quick * 2);
  assert.equal(sessions('--write-baseline'), quick);
  assert.equal(sessions('--full'), prompts.length * 2 * 3);
  const splitWithoutFull = spawnSync(process.execPath, [`${root}benchmarks/routing.mjs`, '--dry-run', '--split', 'train'], { encoding: 'utf8' });
  assert.equal(splitWithoutFull.status, 2);
  assert.match(splitWithoutFull.stderr, /--split needs --full/);
});

test('the routing home turns off every installed plugin', () => {
  const home = mkdtempSync(join(tmpdir(), 'routing-home-test-'));
  const before = process.env.HOME;
  let mirror;
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'exo@blauwtje': true, 'tokeneconomizer@tokeneconomizer': true } }));
    process.env.HOME = home;
    mirror = routingHome();
    const settings = JSON.parse(readFileSync(join(mirror, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(settings.enabledPlugins, { 'exo@blauwtje': false, 'tokeneconomizer@tokeneconomizer': false });
  } finally {
    process.env.HOME = before;
    rmSync(home, { recursive: true, force: true });
    if (mirror) rmSync(mirror, { recursive: true, force: true });
  }
});
