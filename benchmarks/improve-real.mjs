#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { makeRunFolder, withHome } from '../skills/edit-skills/scripts/pressure.mjs';
import { SPLITS, buildArmCopy, gains, spendRefusal } from './improve-real-copy.mjs';
import { scoreTarget, startScoreBridge, writeScoreClient } from './improve-real-bridge.mjs';
import { improveTip, spawnSession, streamCost } from './improve-vs-goal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'benchmarks/results/improve-real.json');
const SESSION_MS = environmentMs('EXO_IMPROVE_GOAL_MS', 20 * 60 * 1000);
const QUICK_RUNS = 1;
const DEFAULT_CAP_USD = 1;
const DEFAULT_SPEND_CAP_USD = 5;
const DEFAULT_HELD_OUT_RUNS = 2;
const DEFAULT_SCORE_CALLS = { routing: 3, locate: 2 };
const LOCATE_SESSION_USD = 0.11;
const FALLBACK_SESSION_USD = 0.03;
const ROUTING_CELL = 'sonnet:low';
const GIT_IDENTITY = ['-c', 'user.name=exo-bench', '-c', 'user.email=exo-bench@localhost', '-c', 'commit.gpgsign=false'];
const USAGE = `usage: node benchmarks/improve-real.mjs [--target routing|locate] [--arm <list>] [--runs <n>] [--cap <usd>] [--score-calls <n>] [--held-out-runs <n>] [--spend-cap <usd>] [--baseline <file>] [--out <file>] [--smoke] [--dry-run]
Compares exo:improve and Claude Code /goal, each on opus and on sonnet, on one real exo target: the find-cause skill description (routing) or the locate-code agent (locate).
Each arm works in a leak-free copy with only the train split, scores through score.mjs (at most --score-calls answers), and is then scored on the train and held-out splits of the pristine tree.
Default is the quick tier: ${QUICK_RUNS} run per arm, cap $${DEFAULT_CAP_USD} per arm session, --held-out-runs ${DEFAULT_HELD_OUT_RUNS}, --spend-cap $${DEFAULT_SPEND_CAP_USD}. --smoke runs goal-sonnet alone with one score call and one held-out run.
--dry-run prints the plan and the most it can spend, then exits. --arm takes improve-opus, improve-sonnet, goal-opus, goal-sonnet. --baseline reads {"<target>":{"train":<n>,"heldOut":<n>}} and records the gains.
Results append to --out per arm and run; a recorded arm and run is skipped. A run is refused when the spend so far plus its projection exceeds --spend-cap.`;

export const ARMS = {
  'improve-opus': { kind: 'improve', model: 'opus', tier: 'strong' },
  'improve-sonnet': { kind: 'improve', model: 'sonnet', tier: 'standard' },
  'goal-opus': { kind: 'goal', model: 'opus', tier: null },
  'goal-sonnet': { kind: 'goal', model: 'sonnet', tier: null }
};

export function goalText(target) {
  return `Raise the number that \`node score.mjs\` prints by editing only \`${SPLITS[target].file}\`; \`score.mjs\`, \`benchmarks/\`, \`lib/\` and \`hooks/\` stay unchanged.`;
}

export function armPrompt(arm, target) {
  const goal = goalText(target);
  return ARMS[arm].kind === 'improve' ? `/exo:improve ${goal}` : `/goal ${goal}; or stop when node score.mjs refuses`;
}

export function armConfig({ arm, target, cap, scratch }) {
  const { kind, model, tier } = ARMS[arm];
  const base = ['-p', armPrompt(arm, target), '--model', model, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(cap)];
  const improve = kind === 'improve';
  return {
    args: improve ? [...base, '--plugin-dir', scratch] : base,
    env: improve ? {} : { CLAUDE_CODE_SUBAGENT_MODEL: model },
    improveRoundTier: tier
  };
}

export function withImproveRoundTier(text, tier) {
  const block = /("improve-round"\s*:\s*\{\s*"on"\s*:\s*\{\s*"tier"\s*:\s*")[a-z]+(")/;
  if (!block.test(text)) throw new Error('lib/model-kinds.json has no improve-round tier to set');
  return text.replace(block, `$1${tier}$2`);
}

export function projectedSpend({ cap, calls, heldOutRuns, sessions, sessionUsd }) {
  return cap + (calls + 1) * sessions.train * sessionUsd + heldOutRuns * sessions.heldOut * sessionUsd;
}

export function scorerSessions(tree, target) {
  if (target === 'locate') return { train: SPLITS.locate.train.length, heldOut: SPLITS.locate.heldOut.length };
  const prompts = JSON.parse(fs.readFileSync(path.join(tree, SPLITS.routing.data), 'utf8'));
  const own = prompts.filter((entry) => entry.expect === SPLITS.routing.skill);
  return { train: own.filter((entry) => entry.split === SPLITS.routing.train).length, heldOut: own.filter((entry) => entry.split === SPLITS.routing.heldOut).length };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function sessionUsd(tree, target) {
  if (target === 'locate') return LOCATE_SESSION_USD;
  const file = path.join(tree, 'benchmarks/results/routing.json');
  if (!fs.existsSync(file)) return FALLBACK_SESSION_USD;
  const sessions = JSON.parse(fs.readFileSync(file, 'utf8')).sessions ?? [];
  const costs = sessions.filter((session) => session.cell === ROUTING_CELL && session.arm === 'hook' && typeof session.cost_usd === 'number').map((session) => session.cost_usd);
  return median(costs) ?? FALLBACK_SESSION_USD;
}

export function dryRunPlan({ options, sessions, sessionUsd: perSession }) {
  const rows = options.arms.map((arm) => {
    const projected = projectedSpend({ cap: options.cap, calls: options.scoreCalls, heldOutRuns: options.heldOutRuns, sessions, sessionUsd: perSession });
    return { arm, model: ARMS[arm].model, tier: ARMS[arm].tier, projected: projected * options.runs };
  });
  return { rows, total: rows.reduce((sum, row) => sum + row.projected, 0), wallMin: SESSION_MS / 60000 };
}

export function dryRunLines({ options, sessions, sessionUsd: perSession }) {
  const plan = dryRunPlan({ options, sessions, sessionUsd: perSession });
  const tier = options.runs === QUICK_RUNS ? 'quick' : 'full';
  const lines = [`dry-run: ${tier} tier, target ${options.target}, ${options.arms.length} arms x ${options.runs} runs, cap $${options.cap.toFixed(2)} per arm session, ${options.scoreCalls} score calls`];
  lines.push(`scorer: train call ${sessions.train} sessions, held-out call ${sessions.heldOut} sessions, $${perSession.toFixed(4)} per session; per arm ${options.scoreCalls + 1} train calls and ${options.heldOutRuns} held-out calls`);
  for (const row of plan.rows) lines.push(`  ${row.arm}: --model ${row.model}${row.tier === null ? '' : `, improve-round tier ${row.tier}`}, at most $${row.projected.toFixed(2)}`);
  lines.push(`max spend $${plan.total.toFixed(2)} against spend cap $${options.spendCap.toFixed(2)}, wall at most ${plan.wallMin} min per arm session plus scorer time`);
  return lines;
}

export function runKey({ target, arm, run }) {
  return `${target}|${arm}|${run}`;
}

export function recordedKeys(runs) {
  return new Set(runs.map(runKey));
}

export function spentSoFar(runs) {
  return runs.reduce((sum, record) => sum + (record.totalCost ?? 0), 0);
}

export function armRecord({ target, arm, run, cap, session, bridge, train, heldOut, baseline, changedOutside, diffFile, finalRef, error }) {
  const armCost = session.costUsd;
  const harnessSpend = (train?.spend ?? 0) + (heldOut?.spend ?? 0);
  const record = {
    target, arm, run, model: ARMS[arm].model, capUsd: cap,
    armCostUsd: armCost, scorerSpendInArm: bridge.spend, harnessScoringSpend: harnessSpend,
    totalCost: armCost + bridge.spend + harnessSpend,
    wallS: session.wallS, killed: session.killed, subtype: session.subtype,
    scoreCallsUsed: bridge.calls, scoreHistory: bridge.history,
    trainScore: train?.mean ?? null, heldOutScores: heldOut?.scores ?? [], heldOutMean: heldOut?.mean ?? null,
    finalRef, diffFile, changedOutside, error: error ?? null
  };
  if (baseline !== undefined && train !== undefined && heldOut !== undefined) record.gains = gains({ train: train.mean, heldOut: heldOut.scores }, baseline, target);
  return record;
}

export function parseOptions(argv) {
  const flags = parseFlags(argv, { target: 'string', arm: 'string', runs: 'string', cap: 'string', 'score-calls': 'string', 'held-out-runs': 'string', 'spend-cap': 'string', baseline: 'string', out: 'string', smoke: 'boolean', 'dry-run': 'boolean' }, { usage: USAGE });
  const target = flags.target ?? 'routing';
  if (!(target in SPLITS)) throw new UsageError('--target takes routing or locate');
  const smoke = flags.smoke === true;
  const names = flags.arm === undefined ? (smoke ? ['goal-sonnet'] : Object.keys(ARMS)) : flags.arm.split(',').filter(Boolean);
  for (const name of names) if (!(name in ARMS)) throw new UsageError(`--arm takes ${Object.keys(ARMS).join(', ')}`);
  const whole = (name, fallback, minimum) => {
    const value = Number(flags[name] ?? fallback);
    if (!Number.isInteger(value) || value < minimum) throw new UsageError(`--${name} needs a whole number of at least ${minimum}`);
    return value;
  };
  const dollars = (name, fallback) => {
    const value = Number(flags[name] ?? fallback);
    if (!(value > 0)) throw new UsageError(`--${name} needs a dollar amount above 0`);
    return value;
  };
  return {
    target, arms: names, smoke, dryRun: flags['dry-run'] === true,
    runs: whole('runs', QUICK_RUNS, 1),
    cap: dollars('cap', DEFAULT_CAP_USD),
    scoreCalls: whole('score-calls', smoke ? 1 : DEFAULT_SCORE_CALLS[target], 1),
    heldOutRuns: whole('held-out-runs', smoke ? 1 : DEFAULT_HELD_OUT_RUNS, 1),
    spendCap: dollars('spend-cap', DEFAULT_SPEND_CAP_USD),
    baseline: flags.baseline === undefined ? undefined : JSON.parse(fs.readFileSync(flags.baseline, 'utf8')),
    out: path.resolve(flags.out ?? OUT)
  };
}

function git(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
}

function commitInCopy(scratch, message) {
  git(scratch, ['add', '--all', '--force']);
  git(scratch, [...GIT_IDENTITY, 'commit', '--quiet', '-m', message]);
}

function prepareCopy({ repo, target, arm, folder, stateDir }) {
  const { scratch } = folder;
  fs.rmSync(scratch, { recursive: true, force: true });
  buildArmCopy({ repo, target, dest: scratch });
  git(scratch, ['config', 'user.name', 'exo-bench']);
  git(scratch, ['config', 'user.email', 'exo-bench@localhost']);
  writeScoreClient({ dir: scratch, stateDir, target });
  const tier = ARMS[arm].tier;
  if (tier !== null) {
    const kinds = path.join(scratch, 'lib/model-kinds.json');
    fs.writeFileSync(kinds, withImproveRoundTier(fs.readFileSync(kinds, 'utf8'), tier));
  }
  commitInCopy(scratch, 'score client');
  return git(scratch, ['rev-parse', 'HEAD']).stdout.trim();
}

function finalState({ arm, target, scratch, base }) {
  const file = SPLITS[target].file;
  const ref = ARMS[arm].kind === 'improve' ? improveTip(scratch) : null;
  if (ref !== null) {
    const diff = git(scratch, ['diff', base, ref, '--', file]).stdout;
    const names = git(scratch, ['diff', '--name-only', base, ref]).stdout.split('\n').filter(Boolean);
    return { ref, text: git(scratch, ['show', `${ref}:${file}`]).stdout, diff, changedOutside: names.filter((name) => name !== file) };
  }
  const names = git(scratch, ['diff', '--name-only', base]).stdout.split('\n').filter(Boolean);
  return { ref: 'working tree', text: fs.readFileSync(path.join(scratch, file), 'utf8'), diff: git(scratch, ['diff', base, '--', file]).stdout, changedOutside: names.filter((name) => name !== file) };
}

function readRecord(out) {
  if (!fs.existsSync(out)) return { runs: [] };
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

function appendRecord(out, record, header) {
  const file = readRecord(out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ ...header, ...file, runs: [...file.runs, record] }, null, 2)}\n`);
}

async function runArm({ options, arm, run, home, repo }) {
  const { target } = options;
  const folder = makeRunFolder(`ir-${target}-${arm}`);
  const stateDir = path.join(folder.tmp, 'score-state');
  const base = prepareCopy({ repo, target, arm, folder, stateDir });
  const bridge = startScoreBridge({ stateDir, repo, target, calls: options.scoreCalls });
  const config = armConfig({ arm, target, cap: options.cap, scratch: folder.scratch });
  const confined = withHome(confinedClaude({ args: config.args, roots: folder.roots, cwd: folder.scratch, tmp: folder.tmp }), home);
  const logFile = path.join(os.tmpdir(), `improve-real-${target}-${arm}-${Date.now()}.jsonl`);
  const spawned = await spawnSession({ run: confined, env: config.env, logFile, wallMs: SESSION_MS });
  const bridgeResult = await bridge.stop();
  const { costUsd, result } = streamCost(spawned.text.split('\n'));
  const session = { costUsd: Number(costUsd.toFixed(4)), wallS: spawned.wallS, killed: spawned.killed, subtype: result?.subtype ?? null };
  const final = finalState({ arm, target, scratch: folder.scratch, base });
  const diffFile = `${options.out.replace(/\.json$/, '')}/${target}-${arm}-${run}.diff`;
  fs.mkdirSync(path.dirname(diffFile), { recursive: true });
  fs.writeFileSync(diffFile, final.diff);
  const scoring = { repo, target, targetText: final.text };
  let train;
  let heldOut;
  let error;
  try {
    train = await scoreTarget({ ...scoring, split: 'train', runs: 1 });
    heldOut = await scoreTarget({ ...scoring, split: 'held-out', runs: options.heldOutRuns });
  } catch (failure) {
    error = failure.message;
  }
  fs.rmSync(path.dirname(folder.scratch), { recursive: true, force: true });
  return armRecord({ target, arm, run, cap: options.cap, session, bridge: bridgeResult, train, heldOut, baseline: options.baseline, changedOutside: final.changedOutside, diffFile, finalRef: final.ref, error });
}

function describe(record) {
  const score = (value) => (value === null ? 'n/a' : value.toFixed(3));
  return `${record.arm} run ${record.run}: arm $${record.armCostUsd}, scorer in arm $${record.scorerSpendInArm.toFixed(4)}, harness scoring $${record.harnessScoringSpend.toFixed(4)}, total $${record.totalCost.toFixed(4)}, ${record.wallS} s, ${record.scoreCallsUsed} score calls, train ${score(record.trainScore)}, held-out ${score(record.heldOutMean)}${record.error === null ? '' : `, error ${record.error}`}`;
}

async function main(argv) {
  const options = parseOptions(argv);
  const sessions = scorerSessions(ROOT, options.target);
  const perSession = sessionUsd(ROOT, options.target);
  if (options.dryRun) {
    for (const line of dryRunLines({ options, sessions, sessionUsd: perSession })) console.log(line);
    return;
  }
  const refusal = confineRefusal();
  if (refusal !== undefined) throw new Error(refusal);
  const home = makeDefaultOptionsHome({ withoutClaudeMd: true, withoutInstalledPlugins: true });
  const projected = projectedSpend({ cap: options.cap, calls: options.scoreCalls, heldOutRuns: options.heldOutRuns, sessions, sessionUsd: perSession });
  const header = { date: new Date().toISOString().slice(0, 10), target: options.target };
  try {
    for (let run = 1; run <= options.runs; run += 1) {
      for (const arm of options.arms) {
        const recorded = readRecord(options.out).runs;
        if (recordedKeys(recorded).has(runKey({ target: options.target, arm, run }))) continue;
        const stop = spendRefusal({ spent: spentSoFar(recorded), projected, cap: options.spendCap });
        if (stop !== null) throw new Error(`${stop} (before ${arm} run ${run})`);
        const record = await runArm({ options, arm, run, home, repo: ROOT });
        appendRecord(options.out, record, header);
        console.log(describe(record));
      }
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof UsageError ? `${error.message}\n${USAGE}` : error.message);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
