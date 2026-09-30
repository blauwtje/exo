#!/usr/bin/env node
// benchmarks/terse-drift.mjs
// Multi-turn drift harness for `replies=terse`: one run is one 12-turn session
// in a fresh repository, held in a single `claude -p` process with streamed
// input, so SessionStart fires at startup as in an interactive session rather
// than on every turn. It scores the article density of the chat turns (turns
// 1, 10 and 11 gate), compacts at turn 7 and asks for a commit at turn 12,
// whose body must keep full prose.
//
//   node benchmarks/terse-drift.mjs                        prints the session count and cap, spawns nothing
//   node benchmarks/terse-drift.mjs --confirm              one run: one process of 12 turns
//   node benchmarks/terse-drift.mjs --plugin-dir <dir> --runs 3 --out <dir> --confirm
//   node benchmarks/terse-drift.mjs --model claude-opus-5-5 --effort high --confirm

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { scoreProse } from './prose-density.mjs';
import { MODELS, ROOT } from './tasks.mjs';

const SESSION_BUDGET_USD = '3';
const SESSION_TIMEOUT_MS = 40 * 60 * 1000;
const MIN_CHAT_WORDS = 25;
const MAX_CHAT_RATE = 2.0;
const MIN_COMMIT_WORDS = 20;
const MIN_COMMIT_RATE = 3.0;
const GATED_TURNS = [1, 10, 11];
const COMPACT_TURN = 7;
const COMMIT_TURN = 12;
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export const TURN_PROMPTS = [
  'Read limiter.js and explain what RateLimiter is for and how a caller uses it.',
  'Explain step by step what `allow` does when it is called.',
  'Explain what happens at the edge of the rate window, when a call arrives just as the period ends.',
  'Explain how a clock skew between callers would show up in this limiter.',
  'Explain what a test for that clock skew case would check and why.',
  'Explain what would have to change in limiter.js to make the window a sliding window.',
  '/compact',
  'Explain how memory use grows with the number of distinct keys, and what that means for a long-running service.',
  'Explain how the limiter behaves when several processes share one public API.',
  'Explain why the constructor takes `now` as a parameter and what that buys a test.',
  'Explain what could go wrong if two callers reach `allow` at the same moment.',
  'Add a one-line comment above `allow` in limiter.js, then commit it with a subject and a body of two or three sentences explaining why.'
];

export function parseArguments(argv) {
  const options = { pluginDir: ROOT, level: 'terse', model: 'sonnet', effort: null, runs: 1, concurrency: null, out: null, confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--confirm') options.confirm = true;
    else if (flag === '--plugin-dir') options.pluginDir = path.resolve(value());
    else if (flag === '--level') options.level = value();
    else if (flag === '--model') options.model = value();
    else if (flag === '--effort') options.effort = value();
    else if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--out') options.out = value();
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!(options.model in MODELS) && !options.model?.startsWith('claude-')) {
    throw new Error(`unknown model ${options.model}; one of ${Object.keys(MODELS).join(', ')}, or a full id starting with claude-`);
  }
  if (options.effort !== null && !EFFORTS.includes(options.effort)) throw new Error(`unknown effort ${options.effort}; one of ${EFFORTS.join(', ')}`);
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs takes a whole number of 1 or more');
  options.concurrency = options.concurrency ?? options.runs;
  return options;
}

// A key of MODELS maps to its pinned id; a full id starting with claude- passes through unchanged.
export function modelId(model) {
  return MODELS[model] ?? model;
}

function commitReasons(commitText, commitScore) {
  if (commitText === null) return { fail: [], unrun: ['no commit landed'] };
  if (commitScore.words === 0) return { fail: ['commit body is empty'], unrun: [] };
  if (commitScore.words < MIN_COMMIT_WORDS) return { fail: [`commit body has ${commitScore.words} words, under ${MIN_COMMIT_WORDS}`], unrun: [] };
  if (commitScore.articleRate < MIN_COMMIT_RATE) return { fail: [`commit body rate ${commitScore.articleRate.toFixed(1)} is under ${MIN_COMMIT_RATE.toFixed(1)}`], unrun: [] };
  return { fail: [], unrun: [] };
}

// FAIL outranks UNRUN: a measured slip is a finding even when another turn went unmeasured.
// `turns` holds the 12 records; `commitText` is the commit body, '' when the commit has only a
// subject, or null when no commit landed. `reasons` names each cause behind a FAIL or an UNRUN.
export function verdictFor(turns, commitText) {
  const commitScore = commitText === null ? null : scoreProse(commitText);
  const commit = { text: commitText, score: commitScore };
  const fail = [];
  const unrun = [];
  for (const turn of turns.filter((record) => GATED_TURNS.includes(record.turn))) {
    if (turn.score === null) unrun.push(`turn ${turn.turn} has no reply`);
    else if (turn.score.words < MIN_CHAT_WORDS) unrun.push(`turn ${turn.turn} has ${turn.score.words} words, under ${MIN_CHAT_WORDS}`);
    else if (turn.score.articleRate > MAX_CHAT_RATE) fail.push(`turn ${turn.turn} rate ${turn.score.articleRate.toFixed(1)} is above ${MAX_CHAT_RATE.toFixed(1)}`);
  }
  const commitVerdict = commitReasons(commitText, commitScore);
  fail.push(...commitVerdict.fail);
  unrun.push(...commitVerdict.unrun);
  if (fail.length > 0) return { verdict: 'FAIL', reasons: fail, commit };
  if (unrun.length > 0) return { verdict: 'UNRUN', reasons: unrun, commit };
  return { verdict: 'PASS', reasons: [], commit };
}

// Names what cut the claude process short, or null when it exited 0 on its own.
export function processCause(outcome) {
  if (outcome.spawnError !== null) return `claude failed to start: ${outcome.spawnError}`;
  if (outcome.timedOut) return `claude was killed after the ${SESSION_TIMEOUT_MS / 60000}-minute session timeout`;
  if (outcome.signal !== null) return `claude ended on signal ${outcome.signal}`;
  if (outcome.exitCode !== 0) return `claude exited ${outcome.exitCode}; see stderr.log`;
  return null;
}

export function dryRunLine(options) {
  const turns = options.runs * TURN_PROMPTS.length;
  const effort = options.effort ?? 'the CLI default';
  return `${options.runs} claude -p session(s) planned, each one process of ${TURN_PROMPTS.length} turns (${turns} turns in all), on ${modelId(options.model)} at effort ${effort}, at most $${SESSION_BUDGET_USD} per session; nothing started. Re-run with --confirm to spend it.`;
}

export function claudeArguments(options) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--plugin-dir', options.pluginDir,
    '--model', modelId(options.model),
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--permission-mode', 'bypassPermissions',
    '--max-budget-usd', SESSION_BUDGET_USD
  ];
  if (options.effort !== null) args.push('--effort', options.effort);
  return args;
}

// One stream-json user message, newline-terminated, as `--input-format stream-json` reads it from stdin.
export function userMessageLine(prompt) {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`;
}

function parseEvent(line) {
  try {
    return JSON.parse(line);
  } catch {
    return { type: 'unparsed', line };
  }
}

// Splits `--output-format stream-json` stdout into turns. A turn is every event up to and
// including its `result` event; `push` takes chunks cut at any point, even inside a line.
export function createTurnReader(onTurn) {
  let pending = '';
  let events = [];
  return {
    push(chunk) {
      pending += chunk;
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line !== '') {
          const event = parseEvent(line);
          events.push(event);
          if (event.type === 'result') {
            onTurn({ events, result: event });
            events = [];
          }
        }
        newline = pending.indexOf('\n');
      }
    }
  };
}

// `/compact` in streamed input emits this system event once the compaction lands.
export function isCompactionEvent(event) {
  return event.type === 'system' && event.subtype === 'compact_boundary';
}

function turnFailed(result) {
  return result.is_error === true || result.subtype !== 'success';
}

// Names the first turn that failed or never returned, or null when all 12 succeeded.
function incompleteCause(streamTurns) {
  const failedIndex = streamTurns.findIndex((streamTurn) => turnFailed(streamTurn.result));
  if (failedIndex !== -1) {
    const { subtype } = streamTurns[failedIndex].result;
    return `turn ${failedIndex + 1} failed (${subtype})`;
  }
  if (streamTurns.length < TURN_PROMPTS.length) return `the stream ended after ${streamTurns.length} of ${TURN_PROMPTS.length} turns`;
  return null;
}

// Maps the streamed turns onto the 12 prompts. A turn with no result or a failed one has no text;
// compaction counts only when turn 7's own events hold the compact boundary.
export function sessionRecords(streamTurns) {
  const turns = TURN_PROMPTS.map((prompt, index) => {
    const turn = index + 1;
    const result = streamTurns[index]?.result ?? null;
    const text = result !== null && !turnFailed(result) && typeof result.result === 'string' ? result.result : null;
    const score = text === null || turn === COMPACT_TURN ? null : scoreProse(text);
    return { turn, prompt, text, score };
  });
  const cause = incompleteCause(streamTurns);
  const compacted = streamTurns[COMPACT_TURN - 1]?.events.some(isCompactionEvent) ?? false;
  return { turns, complete: cause === null, cause, compaction: compacted ? 'confirmed' : 'UNRUN' };
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function prepareRepository(options, workdir) {
  fs.cpSync(path.join(ROOT, 'benchmarks', 'safe', 'rate-limit', 'seed'), workdir, { recursive: true });
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.name', 'bench']);
  git(workdir, ['config', 'user.email', 'bench@example.com']);
  git(workdir, ['add', '-A']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  fs.mkdirSync(path.join(workdir, '.claude'));
  fs.writeFileSync(path.join(workdir, '.claude', 'exo.json'), `${JSON.stringify({ replies: options.level })}\n`);
  fs.writeFileSync(path.join(workdir, '.claude', 'settings.json'), `${JSON.stringify({ outputStyle: 'exo:scannable' })}\n`);
  fs.appendFileSync(path.join(workdir, '.git', 'info', 'exclude'), '.claude/\n');
}

// Sends one prompt, waits for its `result` event, then sends the next; stdin closes after the
// last turn or the first failed one, which ends the process. Resolves with the streamed turns
// and how the process ended; stderr goes to stderr.log in the run directory.
function streamSession(options, workdir, runDirectory) {
  return new Promise((resolve) => {
    const streamTurns = [];
    const stderr = fs.openSync(path.join(runDirectory, 'stderr.log'), 'w');
    const child = spawn('claude', claudeArguments(options), {
      cwd: workdir,
      env: { ...process.env, EXO_SAVINGS_DIR: path.join(runDirectory, 'record') },
      stdio: ['pipe', 'pipe', stderr]
    });
    const sendNextTurn = () => child.stdin.write(userMessageLine(TURN_PROMPTS[streamTurns.length]));
    const reader = createTurnReader((streamTurn) => {
      streamTurns.push(streamTurn);
      const last = streamTurns.length >= TURN_PROMPTS.length || turnFailed(streamTurn.result);
      if (last) child.stdin.end();
      else if (!child.stdin.writableEnded) sendNextTurn();
    });
    let timedOut = false;
    let spawnError = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, SESSION_TIMEOUT_MS);
    // A pipe closed by an exiting claude leaves turns without a result, which sessionRecords marks incomplete.
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => reader.push(chunk));
    // A failed spawn emits 'error' and may still emit 'close'; the first of the two settles.
    let settled = false;
    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.closeSync(stderr);
      resolve({ streamTurns, outcome: { exitCode, signal, spawnError, timedOut } });
    };
    child.on('error', (error) => {
      spawnError = error.message;
      finish(null, null);
    });
    child.on('close', finish);
    sendNextTurn();
  });
}

// The body of the session's commit: '' for a subject-only commit, null when only the seed commit exists.
function commitBody(workdir) {
  if (git(workdir, ['rev-list', '--count', 'HEAD']).trim() === '1') return null;
  return git(workdir, ['log', '-1', '--format=%b']).trim();
}

// An UNRUN names the process and stream causes first, since they explain the verdict's own reasons.
export function runReasons(verdict, outcome, cause) {
  if (verdict.verdict !== 'UNRUN') return verdict.reasons;
  return [processCause(outcome), cause, ...verdict.reasons].filter((reason) => reason !== null);
}

async function runSession(options, runDirectory) {
  fs.mkdirSync(runDirectory, { recursive: true });
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-terse-drift-'));
  try {
    prepareRepository(options, workdir);
    const { streamTurns, outcome } = await streamSession(options, workdir, runDirectory);
    for (const [index, { result }] of streamTurns.entries()) {
      fs.writeFileSync(path.join(runDirectory, `turn-${index + 1}.json`), `${JSON.stringify(result, null, 2)}\n`);
    }
    const { turns, complete, cause, compaction } = sessionRecords(streamTurns);
    const verdict = verdictFor(turns, complete ? commitBody(workdir) : null);
    const summary = {
      model: modelId(options.model), effort: options.effort, level: options.level,
      verdict: verdict.verdict, reasons: runReasons(verdict, outcome, cause), commit: verdict.commit,
      process: outcome, compaction, turns
    };
    fs.writeFileSync(path.join(runDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

async function runPool(items, limit, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

function printTable(summaries) {
  const rate = (turn) => (turn.score === null || turn.score.words < MIN_CHAT_WORDS ? '-' : turn.score.articleRate.toFixed(1));
  console.log(['run', ...TURN_PROMPTS.map((_, index) => `t${index + 1}`), 'commit'].join('\t'));
  for (const { run, summary } of summaries) {
    const commitRate = summary.commit.score === null ? '-' : summary.commit.score.articleRate.toFixed(1);
    console.log([run, ...summary.turns.map(rate), commitRate].join('\t'));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.confirm) {
    console.log(dryRunLine(options));
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const out = options.out ?? path.join(ROOT, 'benchmarks', 'runs', `${date}-terse-drift`);
  console.log(`model ${modelId(options.model)}, effort ${options.effort ?? 'the CLI default'}, results under ${out}`);
  const runs = Array.from({ length: options.runs }, (_, index) => index + 1);
  const summaries = [];
  await runPool(runs, options.concurrency, async (run) => {
    const summary = await runSession(options, path.join(out, String(run)));
    summaries.push({ run, summary });
    const reasons = summary.reasons.length > 0 ? `: ${summary.reasons.join('; ')}` : '';
    console.log(`run ${run}: ${summary.verdict} (compaction ${summary.compaction})${reasons}`);
  });
  summaries.sort((left, right) => left.run - right.run);
  printTable(summaries);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
