import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fixture, git, gitRepository, run } from './harness.mjs';

const TOOL = path.resolve('benchmarks/delegation-readout.mjs');
const { mainCheckout, runArguments } = await import(TOOL);

const TASKS = ['value-web-research', 'value-rename-propagation', 'value-lean-minimal-diff'];
const LEAN = 'value-lean-minimal-diff';

function assistant(tokens, calls = []) {
  const content = calls.length === 0 ? [{ type: 'text', text: 'ok' }] : calls.map((id) => ({ type: 'tool_use', id, name: 'Agent', input: {} }));
  return { type: 'assistant', message: { content, usage: { input_tokens: 1000, cache_read_input_tokens: tokens - 1000, cache_creation_input_tokens: 0 } } };
}

async function writeCell(out, config, cell) {
  const directory = path.join(out, cell.task, cell.arm, String(cell.run));
  const sessionId = `${cell.task}-${cell.arm}-${cell.run}`;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'checks.json'), JSON.stringify({ pass: cell.pass, timedOut: cell.timedOut === true }));
  if (cell.timedOut) return;
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify({ session_id: sessionId, total_cost_usd: cell.cost }));
  const slug = path.join(config, 'projects', 'slug');
  await fs.mkdir(slug, { recursive: true });
  const turns = [assistant(cell.peak, cell.agents ?? []), assistant(cell.peak / 2)];
  await fs.writeFile(path.join(slug, `${sessionId}.jsonl`), `${turns.map((turn) => JSON.stringify(turn)).join('\n')}\n`);
  if (cell.subagent === undefined) return;
  const delegates = path.join(slug, sessionId, 'subagents');
  await fs.mkdir(delegates, { recursive: true });
  await fs.writeFile(path.join(delegates, 'agent-1.jsonl'), `${JSON.stringify(assistant(cell.subagent, ['s1', 's2']))}\n`);
}

async function cells(options) {
  const out = await fixture();
  const config = await fixture();
  const grid = TASKS.flatMap((task) => ['exo', 'exo-before'].flatMap((arm) => [1, 2, 3].map((run) => ({ task, arm, run, pass: true, cost: 1, peak: 100_000 }))));
  for (const base of grid) await writeCell(out, config, { ...base, ...options(base) });
  return { out, config };
}

const readout = ({ out, config }, ...extra) => run(TOOL, ['--check', out, ...extra], { env: { CLAUDE_CONFIG_DIR: config } });
const cheaperExo = (cell) => (cell.arm === 'exo' ? { cost: 0.8 } : {});

test('runArguments names the paired value run with the cap and the main checkout as the before plugin', () => {
  assert.deepEqual(runArguments({ out: 'bench', beforePlugin: '/main', dryRun: false }), [
    '--tier', 'value',
    '--tasks', TASKS.join(','),
    '--arms', 'exo,exo-before',
    '--before-plugin', '/main',
    '--model', 'sonnet',
    '--runs', '3',
    '--out', 'bench',
    '--max-total-usd', '25',
    '--confirm'
  ]);
});

test('runArguments swaps --confirm for --dry-run so no session starts', () => {
  const argv = runArguments({ out: 'bench', beforePlugin: '/main', dryRun: true });
  assert.equal(argv.at(-1), '--dry-run');
  assert.equal(argv.includes('--confirm'), false);
});

test('mainCheckout resolves the main checkout from inside a linked worktree', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const linked = path.join(await fixture(), 'linked');
  git(root, 'worktree', 'add', '-q', '-b', 'side', linked);
  assert.equal(mainCheckout(linked), root);
  assert.equal(mainCheckout(root), root);
});

test('--check exits 0 and prints pass, cost, peak and Agent calls per arm when exo is cheaper and nothing is lost', async () => {
  const result = await readout(await cells(cheaperExo));
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /arm exo-before pass 9\/9 cost \$9\.00 mean peak 100000 agent calls 0/);
  assert.match(result.stdout, /arm exo pass 9\/9 cost \$7\.20 mean peak 100000 agent calls 0/);
  assert.match(result.stdout, /cost -20\.0% peak 0\.0%/);
});

test('--check exits 0 when only the mean peak is lower, and says which measure moved', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo' ? { peak: 80_000 } : {})));
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /cost lower no peak lower yes/);
});

test('--check exits 1 when exo is neither cheaper nor lighter', async () => {
  const result = await readout(await cells(() => ({})));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not lower in cost or mean peak/);
});

test('--check exits 1 when exo passes fewer cells than exo-before', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo' && cell.task === LEAN && cell.run === 1 ? { cost: 0.8, pass: false } : { cost: cell.arm === 'exo' ? 0.8 : 1 })));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /pass 8\/9 against 9\/9/);
});

test('--check exits 1 when an exo cell of the lean task made an Agent call', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo' && cell.task === LEAN && cell.run === 2 ? { cost: 0.8, agents: ['a1', 'a1', 'a2'] } : cheaperExo(cell))));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /2 Agent calls in value-lean-minimal-diff/);
});

test('--check counts Agent calls in the main transcript only and prints a failed web-research cell as a harness problem', async () => {
  const result = await readout(await cells((cell) => ({ ...cheaperExo(cell), ...(cell.task === 'value-web-research' && cell.run === 1 ? { pass: false } : {}), ...(cell.arm === 'exo-before' && cell.task === 'value-rename-propagation' ? { agents: ['b1'] } : {}) })));
  assert.match(result.stdout, /value-rename-propagation exo-before pass 3\/3 cost \$3\.00 mean peak 100000 agent calls 3/);
  assert.match(result.stdout, /web-research failed in 2 cells: a harness problem, not a verdict/);
});

test('--check keeps a subagent transcript out of the lead Agent calls and peak', async () => {
  const result = await readout(await cells((cell) => ({ ...cheaperExo(cell), ...(cell.arm === 'exo' && cell.task === LEAN ? { subagent: 900_000 } : {}) })));
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /arm exo pass 9\/9 cost \$7\.20 mean peak 100000 agent calls 0/);
});

test('--check names the first cell with no checks and exits 1', async () => {
  const set = await cells(cheaperExo);
  await fs.rm(path.join(set.out, 'value-web-research', 'exo', '2'), { recursive: true });
  const result = await readout(set);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /value-web-research exo #2: no checks\.json/);
});

test('--check drops a run whose exo-before cell timed out from both arms, prints one DROPPED line and judges the remaining pairs', async () => {
  const set = await cells((cell) => (cell.arm === 'exo-before' && cell.task === 'value-web-research' && cell.run === 2 ? { timedOut: true, pass: false } : cheaperExo(cell)));
  const result = await readout(set);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.deepEqual(result.stdout.match(/^DROPPED .*$/gm), ['DROPPED value-web-research run 2: timeout in exo-before']);
  assert.match(result.stdout, /arm exo-before pass 8\/8 cost \$8\.00 mean peak 100000 agent calls 0/);
  assert.match(result.stdout, /arm exo pass 8\/8 cost \$6\.40 mean peak 100000 agent calls 0/);
});

test('--check counts the Agent calls of a lean exo cell whose exo-before partner timed out', async () => {
  const result = await readout(await cells((cell) => {
    if (cell.task !== LEAN || cell.run !== 1) return cheaperExo(cell);
    return cell.arm === 'exo-before' ? { timedOut: true, pass: false } : { cost: 0.8, agents: ['a1'] };
  }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /1 Agent calls in value-lean-minimal-diff/);
});

test('--check prints no row for a task whose runs were all dropped', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo-before' && cell.task === LEAN ? { timedOut: true, pass: false } : cheaperExo(cell))));
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.doesNotMatch(result.stdout, /NaN/);
  assert.doesNotMatch(result.stdout, /^value-lean-minimal-diff /m);
});

test('--check prints the Agent calls of a dropped lean exo cell, so the printed lines agree with the failure', async () => {
  const result = await readout(await cells((cell) => {
    if (cell.task !== LEAN || cell.run !== 1) return cheaperExo(cell);
    return cell.arm === 'exo-before' ? { timedOut: true, pass: false } : { cost: 0.8, agents: ['a1'] };
  }));
  assert.equal(result.code, 1);
  assert.match(result.stdout, /dropped runs: value-lean-minimal-diff exo agent calls 1, counted in the check/);
});

test('--check names a result.json with no total_cost_usd and exits 1', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo' && cell.task === 'value-web-research' && cell.run === 2 ? { cost: undefined } : cheaperExo(cell))));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /value-web-research exo #2: no total_cost_usd/);
});

test('--check exits 1 when an exo cell timed out, so a pass drop is not hidden', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo' && cell.task === LEAN && cell.run === 1 ? { timedOut: true, pass: false } : cheaperExo(cell))));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /value-lean-minimal-diff exo #1: timed out/);
});

test('--check names a cell with no result.json that did not time out and exits 1', async () => {
  const set = await cells(cheaperExo);
  await fs.rm(path.join(set.out, 'value-web-research', 'exo', '2', 'result.json'));
  const result = await readout(set);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /value-web-research exo #2: no result\.json/);
});

test('--check exits 1 when every run is dropped', async () => {
  const result = await readout(await cells((cell) => (cell.arm === 'exo-before' ? { timedOut: true, pass: false } : cheaperExo(cell))));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /every run timed out/);
});

test('--check names the cell whose transcript is gone and exits 1', async () => {
  const set = await cells(cheaperExo);
  await fs.rm(path.join(set.config, 'projects'), { recursive: true });
  const result = await readout(set);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /value-web-research exo-before #1: no transcript/);
});

test('--run and --dry-run without --check exit 2', async () => {
  for (const flag of ['--run', '--dry-run']) {
    const result = await run(TOOL, [flag]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /needs --check <out dir>/);
  }
});
