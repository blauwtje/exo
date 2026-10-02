// lean-gates-metrics.mjs reads a benchmark run dir: transcripts (main and
// subagents), the fixture repo's commits and review report, suite-runs.jsonl,
// meta.json and stdout.json. These fixtures are synthetic; no claude runs.

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isFullSuiteCommand, parsePlanTasks, parseReviewerReturn, parseReviewReport } from '../benchmarks/lean-gates-metrics.mjs';
import { fixture } from './harness.mjs';

const METRICS = fileURLToPath(new URL('../benchmarks/lean-gates-metrics.mjs', import.meta.url));
const SESSION = 'aaaaaaaa-1111-2222-3333-444444444444';

test('full-suite detection tells the whole suite from one file', () => {
  for (const command of ['npm test', 'cd repo && npm test 2>&1 | tail -5', 'npm run test', 'CI=1 npm t', 'node --test', 'node --test "tests/*.test.mjs"', 'npx vitest run', 'npm test -- --reporter=dot']) {
    assert.equal(isFullSuiteCommand(command), true, command);
  }
  for (const command of ['npm test -- tests/a.test.ts', 'node --test tests/a.test.mjs', 'npx vitest run src/a.test.ts', 'npm run typecheck', 'npm run lint', 'git log']) {
    assert.equal(isFullSuiteCommand(command), false, command);
  }
});

test('review report parses the verdict, weights and dispositions', () => {
  const report = 'FINDINGS\n\nBranch b.\n\n## Findings\n\nsrc/a.ts:3-4\n- weight: defect\n- rule: x\n- evidence: y\n- fix\n\nsrc/b.ts:9-9\n- weight: question\n- rule: x\n- evidence: y\n- report\n\nCount: defect=1 hazard=0 question=1\n';
  const parsed = parseReviewReport(report);
  assert.equal(parsed.verdict, 'FINDINGS');
  assert.equal(parsed.findings, 2);
  assert.deepEqual(parsed.bySeverity, { defect: 1, hazard: 0, question: 1 });
  assert.equal(parsed.fix, 1);
  assert.equal(parsed.report, 1);
  assert.equal(parseReviewReport('CLEAN\n\nNothing.\n\nCount: defect 0, hazard 0, question 0\n').findings, 0);
  assert.deepEqual(parseReviewerReturn('verdict=FINDINGS defect=2 hazard=1 question=0 fix=2 report=/x').fix, 2);
});

test('plan tasks carry their Risk: field', () => {
  const plan = '# P\n\n## Tasks\n\n### Task 1: feat(a): one\n\nDepends on: none | Files: a.ts | Risk: public signature | Proof: `npx vitest run a.test.ts`\n\n### Task 2: feat(b): two\n\nDepends on: 1 | Files: b.ts | Proof: `x`\n\n## Final verification\n';
  assert.deepEqual(parsePlanTasks(plan).map((task) => [task.number, task.risk]), [[1, 'public signature'], [2, null]]);
});

function line(entry) {
  return JSON.stringify(entry);
}

function assistant(id, ts, content, usage, model = 'claude-opus-5-5') {
  return line({ type: 'assistant', timestamp: ts, message: { id, model, role: 'assistant', content, usage } });
}

function result(ts, id, text, extra = {}) {
  return line({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] }, ...extra });
}

const usage = (input, output) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 } });

function gitIn(repo, args, date) {
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { env, stdio: 'pipe' });
}

async function syntheticRun() {
  const root = await fixture();
  const config = path.join(root, 'config');
  const project = path.join(config, 'projects', '-tmp-fixture');
  const run = path.join(root, 'out', '01-new');
  const repo = path.join(run, 'repo');
  await fs.mkdir(path.join(repo, 'docs', 'plans'), { recursive: true });
  await fs.mkdir(path.join(project, SESSION, 'subagents'), { recursive: true });

  gitIn(repo, ['init', '-q', '-b', 'main'], '2026-10-02T10:00:00Z');
  await fs.writeFile(path.join(repo, 'a.mjs'), 'export function add(a, b) {\n  return a + b;\n}\n');
  await fs.writeFile(path.join(repo, 'docs', 'plans', 'p.md'), '# P\n\n### Task 1: feat(a): one\n\nFiles: a.mjs | Proof: `x`\n\n### Task 2: feat(b): two\n\nFiles: b.mjs | Risk: public signature | Proof: `x`\n');
  gitIn(repo, ['add', '-A'], '2026-10-02T10:00:00Z');
  gitIn(repo, ['commit', '-q', '-m', 'seed'], '2026-10-02T10:00:00Z');
  await fs.writeFile(path.join(repo, 'a.mjs'), 'export function add(a, b, c) {\n  return a + b + c;\n}\n');
  gitIn(repo, ['commit', '-q', '-am', 'feat(a): one', '-m', 'Plan-task: p/1'], '2026-10-02T10:03:00Z');
  await fs.writeFile(path.join(repo, 'b.mjs'), 'export const b = 1;\n');
  gitIn(repo, ['add', '-A'], '2026-10-02T10:05:00Z');
  gitIn(repo, ['commit', '-q', '-m', 'feat(b): two', '-m', 'Plan-task: p/2'], '2026-10-02T10:05:00Z');
  await fs.writeFile(path.join(repo, 'b.mjs'), 'export const b = 2;\n');
  gitIn(repo, ['commit', '-q', '-am', 'fix(b): address the branch review'], '2026-10-02T10:12:00Z');
  await fs.mkdir(path.join(repo, '.exo'));
  await fs.writeFile(path.join(repo, '.exo', 'branch-review.md'), 'FINDINGS\n\nb.mjs:1-1\n- weight: hazard\n- rule: r\n- evidence: e\n- fix\n\nCount: defect=0 hazard=1 question=0\n');

  const main = [
    assistant('m1', '2026-10-02T10:00:05.000Z', [{ type: 'tool_use', id: 'tA', name: 'Agent', input: { subagent_type: 'exo:build-task', description: 'Build task 1' } }], usage(10, 20)),
    result('2026-10-02T10:02:30.000Z', 'tA', 'Task 1: GREEN'),
    assistant('m2', '2026-10-02T10:06:00.000Z', [{ type: 'tool_use', id: 'tS', name: 'Skill', input: { skill: 'exo:verify' } }], usage(10, 20)),
    assistant('m2', '2026-10-02T10:06:00.500Z', [{ type: 'text', text: 'repeat of m2 for a second content block' }], usage(10, 20)),
    result('2026-10-02T10:06:01.000Z', 'tS', 'Launching skill'),
    assistant('m3', '2026-10-02T10:06:05.000Z', [{ type: 'tool_use', id: 'tV', name: 'Bash', input: { command: 'node /p/skills/verify/scripts/verify.mjs --plan p' } }], usage(10, 20)),
    result('2026-10-02T10:07:05.000Z', 'tV', 'PASS success-criterion npm test\nREVIEWER: review-branch-deep\nDONE Task 1'),
    assistant('m4', '2026-10-02T10:07:10.000Z', [{ type: 'tool_use', id: 'tR', name: 'Agent', input: { subagent_type: 'exo:review-branch-deep', description: 'Review' } }], usage(10, 20)),
    result('2026-10-02T10:10:10.000Z', 'tR', 'verdict=FINDINGS defect=0 hazard=1 question=0 fix=1 report=.exo/branch-review.md', { toolUseResult: { status: 'completed' } }),
    assistant('m5', '2026-10-02T10:10:15.000Z', [{ type: 'tool_use', id: 'tF', name: 'Agent', input: { subagent_type: 'exo:fix-review', description: 'Fix' } }], usage(10, 20)),
    result('2026-10-02T10:11:15.000Z', 'tF', 'fixed 1'),
    assistant('m6', '2026-10-02T10:11:20.000Z', [{ type: 'tool_use', id: 'tV2', name: 'Bash', input: { command: 'node /p/skills/verify/scripts/verify.mjs --plan p' } }], usage(10, 20)),
    result('2026-10-02T10:11:50.000Z', 'tV2', 'PASS\nREVIEWER: review-branch-deep'),
    assistant('m7', '2026-10-02T10:13:00.000Z', [{ type: 'text', text: 'done' }], usage(10, 20))
  ];
  await fs.writeFile(path.join(project, `${SESSION}.jsonl`), `${main.join('\n')}\n`);
  const subagents = {
    'agent-a1': { meta: { agentType: 'exo:build-task', description: 'Build task 1', toolUseId: 'tA' }, lines: [assistant('s1', '2026-10-02T10:00:06.000Z', [{ type: 'tool_use', id: 'x1', name: 'Bash', input: { command: 'npx vitest run a.test.ts' } }], usage(100, 200), 'claude-sonnet-5-5'), assistant('s2', '2026-10-02T10:02:29.000Z', [{ type: 'tool_use', id: 'x2', name: 'Bash', input: { command: 'npm test' } }], usage(100, 200), 'claude-sonnet-5-5')] },
    'agent-a2': { meta: { agentType: 'exo:review-branch-deep', toolUseId: 'tR' }, lines: [assistant('r1', '2026-10-02T10:07:11.000Z', [{ type: 'text', text: 'verdict=FINDINGS defect=0 hazard=1 question=0 fix=1' }], usage(1000, 500))] },
    'agent-a3': { meta: { agentType: 'exo:fix-review', toolUseId: 'tF' }, lines: [assistant('f1', '2026-10-02T10:10:16.000Z', [{ type: 'text', text: 'ok' }], usage(5, 5), 'claude-sonnet-5-5')] }
  };
  for (const [name, { meta, lines }] of Object.entries(subagents)) {
    await fs.writeFile(path.join(project, SESSION, 'subagents', `${name}.jsonl`), `${lines.join('\n')}\n`);
    await fs.writeFile(path.join(project, SESSION, 'subagents', `${name}.meta.json`), JSON.stringify(meta));
  }
  await fs.writeFile(path.join(run, 'meta.json'), JSON.stringify({ version: 'new', sessionId: SESSION, startedAt: '2026-10-02T10:00:00.000Z', endedAt: '2026-10-02T10:13:30.000Z', wallMs: 810000, exitCode: 0, timedOut: false }));
  await fs.writeFile(path.join(run, 'stdout.json'), JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 1.5, session_id: SESSION }));
  await fs.writeFile(path.join(run, 'suite-runs.jsonl'), ['{"ts":"2026-10-02T10:02:00.000Z","args":[],"full":true}', '{"ts":"2026-10-02T10:01:00.000Z","args":["a.test.ts"],"full":false}', '{"ts":"2026-10-02T10:06:30.000Z","args":[],"full":true}', '{"ts":"2026-10-02T11:00:00.000Z","args":[],"full":true}'].join('\n'));
  return { out: path.dirname(run), config };
}

test('a synthetic run yields phases, suite counts, the token split and quality', async () => {
  const { out, config } = await syntheticRun();
  const { stdout } = await new Promise((resolve, reject) => {
    execFile(process.execPath, [METRICS, out, '--no-recheck'], { env: { ...process.env, CLAUDE_CONFIG_DIR: config }, timeout: 60_000 }, (error, so, se) => (error ? reject(new Error(`${error.message}\n${se}`)) : resolve({ stdout: so })));
  });
  assert.match(stdout, /\| 01-new \|/);
  const metrics = JSON.parse(await fs.readFile(path.join(out, 'metrics.json'), 'utf8'));
  const [run] = metrics.runs;
  assert.equal(run.wall.ms, 810000);
  assert.equal(run.phases.build.ms, 6 * 60 * 1000);
  assert.equal(run.phases.gate.busyMs, 60_000);
  assert.equal(run.phases.review.ms, 3 * 60 * 1000);
  assert.equal(run.phases.review.agentType, 'exo:review-branch-deep');
  assert.equal(run.phases.fix.ms, 60_000);
  assert.equal(run.phases.regate.ms, 30_000);
  assert.equal(run.phases.fixRound.source, 'commit-ts');
  assert.deepEqual(run.phases.buildPerTask.map((task) => [task.task, task.ms / 1000]), [[1, 180], [2, 120]]);
  assert.equal(run.fullSuite.log.full, 2);
  assert.equal(run.fullSuite.bash.full, 1);
  assert.equal(run.fullSuite.bash.verifyCalls, 2);
  assert.equal(run.tokens.main.calls, 7);
  assert.equal(run.tokens.main.input, 70);
  assert.equal(run.tokens.byAgentType['exo:build-task'].input, 200);
  assert.equal(run.tokens.byAgentType['exo:review-branch-deep'].output, 500);
  assert.equal(run.cost.harnessUsd, 1.5);
  assert.ok(run.cost.transcriptUsd > 0);
  assert.equal(run.reviewer.line, 'REVIEWER: review-branch-deep');
  assert.equal(run.reviewer.expectedByOwnRule, 'review-branch-deep');
  assert.equal(run.reviewer.fitsRule, true);
  assert.equal(run.reviewer.risk.riskTasks[0].number, 2);
  assert.equal(run.reviewer.risk.exportedSignatureChanges.length, 1);
  assert.equal(run.quality.findings, 1);
  assert.equal(run.quality.finalVerdict, 'FINDINGS');
  assert.equal(run.quality.fixRounds, 1);
  assert.equal(run.quality.fixCommits, 1);
  assert.equal(run.quality.taskCommits, 2);
  assert.equal(run.quality.allTasksLanded, true);
  assert.equal(metrics.aggregate.new.wallMs.median, 810000);
});

test('suite runs count per agent type, with the warm-up and the guard refusals apart', async () => {
  const { out, config } = await syntheticRun();
  const project = path.join(config, 'projects', '-tmp-fixture');
  const main = path.join(project, `${SESSION}.jsonl`);
  const warm = [
    assistant('w1', '2026-10-02T10:00:01.000Z', [{ type: 'tool_use', id: 'tW', name: 'Bash', input: { command: 'npm test' } }], usage(1, 1)),
    result('2026-10-02T10:00:04.000Z', 'tW', 'ok'),
    assistant('w2', '2026-10-02T10:00:05.000Z', [{ type: 'tool_use', id: 'tW2', name: 'Bash', input: { command: 'npm test > .exo/log' } }], usage(1, 1)),
    result('2026-10-02T10:00:06.000Z', 'tW2', 'ok')
  ];
  await fs.writeFile(main, `${warm.join('\n')}\n${await fs.readFile(main, 'utf8')}`);
  const refusedLines = [assistant('s3', '2026-10-02T10:02:30.000Z', [{ type: 'tool_use', id: 'x3', name: 'Bash', input: { command: 'npm test' } }], usage(1, 1)), result('2026-10-02T10:02:31.000Z', 'x3', 'exo: exo:build-task may not run the whole test suite here: its last run in this project took 33 s')];
  const subagent = path.join(project, SESSION, 'subagents', 'agent-a1.jsonl');
  await fs.writeFile(subagent, `${await fs.readFile(subagent, 'utf8')}${refusedLines.join('\n')}\n`);
  await metricsCli(out, config);
  const [run] = JSON.parse(await fs.readFile(path.join(out, 'metrics.json'), 'utf8')).runs;
  assert.equal(run.fullSuite.warmUp, 1);
  assert.deepEqual(run.fullSuite.byAgentType, { main: 1, 'exo:build-task': 1 });
  assert.deepEqual(run.fullSuite.refusals, { 'exo:build-task': 1 });
  assert.equal(run.fullSuite.bash.full, 2);
  assert.equal(run.fullSuite.log.full, 1);
});

function metricsCli(out, config) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [METRICS, out, '--no-recheck'], { env: { ...process.env, CLAUDE_CONFIG_DIR: config }, timeout: 60_000 }, (error, so, se) => (error ? reject(new Error(`${error.message}\n${se}`)) : resolve({ stdout: so, stderr: se })));
  });
}

const tableRow = (stdout, id) => stdout.split('\n').find((row) => row.startsWith(`| ${id}`));

test('a run whose main transcript is missing reads n/a, warns, and leaves the token and cost aggregate', async () => {
  const { out, config } = await syntheticRun();
  const lost = path.join(out, '02-new');
  await fs.mkdir(lost);
  await fs.writeFile(path.join(lost, 'meta.json'), JSON.stringify({ version: 'new', sessionId: 'bbbbbbbb-1111-2222-3333-444444444444', transcriptDir: path.join(config, 'projects', '-tmp-fixture'), wallMs: 600000, exitCode: 0, timedOut: false }));
  const { stdout, stderr } = await metricsCli(out, config);
  assert.match(stderr, new RegExp(`warning: .*02-new.*not found`));
  assert.doesNotMatch(stderr, /01-new/);
  const metrics = JSON.parse(await fs.readFile(path.join(out, 'metrics.json'), 'utf8'));
  const run = metrics.runs.find((entry) => entry.id === '02-new');
  assert.equal(run.transcriptMissing, true);
  assert.equal(run.transcript, null);
  assert.equal(metrics.runs.find((entry) => entry.id === '01-new').transcriptMissing, false);
  assert.match(tableRow(stdout, '02-new'), /\| n\/a \| n\/a\/- \|/);
  const stats = metrics.aggregate.new;
  assert.deepEqual(stats.excluded.transcriptMissing, ['02-new']);
  assert.equal(stats.totalTokens.n, 1);
  assert.equal(stats.costTranscriptUsd.n, 1);
  assert.ok(stats.costTranscriptUsd.min > 0);
  assert.equal(stats.wallMs.n, 2);
  assert.match(stdout, /\| new \| excluded \| incomplete 0 \(all metrics\); transcript missing 1 \(tokens, \$ transcript\) \| 02-new \|/);
});

test('a run that exited nonzero or timed out is marked incomplete and left out of the aggregate', async () => {
  const { out, config } = await syntheticRun();
  for (const [name, exit] of [['02-new', { exitCode: 1, timedOut: false }], ['03-new', { exitCode: null, signal: 'SIGTERM', timedOut: true }]]) {
    await fs.mkdir(path.join(out, name));
    await fs.writeFile(path.join(out, name, 'meta.json'), JSON.stringify({ version: 'new', sessionId: SESSION, wallMs: 900000, ...exit }));
  }
  const { stdout, stderr } = await metricsCli(out, config);
  assert.doesNotMatch(stderr, /warning:/);
  const metrics = JSON.parse(await fs.readFile(path.join(out, 'metrics.json'), 'utf8'));
  const byId = Object.fromEntries(metrics.runs.map((run) => [run.id, run]));
  assert.equal(byId['01-new'].incomplete, false);
  assert.equal(byId['02-new'].incompleteReason, 'exit 1');
  assert.equal(byId['03-new'].incompleteReason, 'timed out');
  assert.match(tableRow(stdout, '02-new'), /^\| 02-new \[incomplete: exit 1\]\* \| 15\.0 \|/);
  assert.match(tableRow(stdout, '03-new'), /^\| 03-new \[incomplete: timed out\]\* \|/);
  assert.doesNotMatch(tableRow(stdout, '02-new'), /n\/a/);
  const stats = metrics.aggregate.new;
  assert.deepEqual(stats.excluded.incomplete, ['02-new', '03-new']);
  assert.equal(stats.wallMs.n, 1);
  assert.equal(stats.wallMs.median, 810000);
  assert.equal(stats.totalTokens.n, 1);
  assert.match(stdout, /\| new \| excluded \| incomplete 2 \(all metrics\); transcript missing 0/);
});
