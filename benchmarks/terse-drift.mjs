#!/usr/bin/env node
// benchmarks/terse-drift.mjs
// Multi-turn drift harness for `replies=terse`: one run is one 12-turn
// `claude -p --resume` session in a fresh repository. It scores the article
// density of the chat turns (turns 1, 10 and 11 gate), compacts at turn 7 and
// asks for a commit at turn 12, whose body must keep full prose.
//
//   node benchmarks/terse-drift.mjs                        prints the call count and cap, spawns nothing
//   node benchmarks/terse-drift.mjs --confirm              one run of 12 calls
//   node benchmarks/terse-drift.mjs --plugin-dir <dir> --runs 3 --out <dir> --confirm

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { scoreProse } from './prose-density.mjs';
import { MODELS, ROOT } from './tasks.mjs';

const CALL_BUDGET_USD = '1';
const CALL_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_CHAT_WORDS = 25;
const MAX_CHAT_RATE = 2.0;
const MIN_COMMIT_WORDS = 20;
const MIN_COMMIT_RATE = 3.0;
const GATED_TURNS = [1, 10, 11];
const COMPACT_TURN = 7;
const COMMIT_TURN = 12;

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
  const options = { pluginDir: ROOT, level: 'terse', model: 'sonnet', runs: 1, concurrency: null, out: null, confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--confirm') options.confirm = true;
    else if (flag === '--plugin-dir') options.pluginDir = path.resolve(value());
    else if (flag === '--level') options.level = value();
    else if (flag === '--model') options.model = value();
    else if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--out') options.out = value();
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!(options.model in MODELS)) throw new Error(`unknown model ${options.model}; one of ${Object.keys(MODELS).join(', ')}`);
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs takes a whole number of 1 or more');
  options.concurrency = options.concurrency ?? options.runs;
  return options;
}

// FAIL outranks UNRUN: a measured slip is a finding even when another turn went unmeasured.
// `turns` holds the 12 records; `commitText` is the commit body, or null when no commit landed.
export function verdictFor(turns, commitText) {
  const commitScore = commitText ? scoreProse(commitText) : null;
  const commit = { text: commitText ?? null, score: commitScore };
  const gated = turns.filter((turn) => GATED_TURNS.includes(turn.turn));
  const measured = gated.filter((turn) => turn.score !== null && turn.score.words >= MIN_CHAT_WORDS);
  const commitMeasured = commitScore !== null && commitScore.words >= MIN_COMMIT_WORDS;
  const failed = measured.some((turn) => turn.score.articleRate > MAX_CHAT_RATE)
    || (commitMeasured && commitScore.articleRate < MIN_COMMIT_RATE);
  if (failed) return { verdict: 'FAIL', commit };
  if (measured.length < gated.length || !commitMeasured) return { verdict: 'UNRUN', commit };
  return { verdict: 'PASS', commit };
}

export function dryRunLine(options) {
  const calls = options.runs * TURN_PROMPTS.length;
  return `${calls} claude -p calls planned (${options.runs} run(s) of ${TURN_PROMPTS.length} turns), at most $${CALL_BUDGET_USD} each; nothing started. Re-run with --confirm to spend it.`;
}

function claudeArguments(options, prompt, sessionId) {
  const args = [
    '-p', prompt,
    '--plugin-dir', options.pluginDir,
    '--model', MODELS[options.model],
    '--output-format', 'json',
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--permission-mode', 'bypassPermissions',
    '--max-budget-usd', CALL_BUDGET_USD
  ];
  if (sessionId !== null) args.push('--resume', sessionId);
  return args;
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function prepareRepository(options, runDirectory) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-terse-drift-'));
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
  fs.mkdirSync(runDirectory, { recursive: true });
  return workdir;
}

function callClaude(options, prompt, sessionId, workdir, runDirectory) {
  return new Promise((resolve) => {
    let stdout = '';
    const child = spawn('claude', claudeArguments(options, prompt, sessionId), {
      cwd: workdir,
      env: { ...process.env, EXO_SAVINGS_DIR: path.join(runDirectory, 'record') },
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), CALL_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout);
        resolve(result.is_error ? null : result);
      } catch {
        resolve(null);
      }
    });
  });
}

// Confirms a compaction by a compact-boundary record in a session transcript.
function compactionConfirmed(sessionIds) {
  const config = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
  const projects = path.join(config, 'projects');
  if (!fs.existsSync(projects)) return false;
  for (const project of fs.readdirSync(projects)) {
    for (const sessionId of sessionIds) {
      const transcript = path.join(projects, project, `${sessionId}.jsonl`);
      if (fs.existsSync(transcript) && fs.readFileSync(transcript, 'utf8').includes('compact_boundary')) return true;
    }
  }
  return false;
}

function commitBody(workdir) {
  if (git(workdir, ['rev-list', '--count', 'HEAD']).trim() === '1') return null;
  return git(workdir, ['log', '-1', '--format=%b']).trim() || null;
}

async function runSession(options, runDirectory) {
  const workdir = prepareRepository(options, runDirectory);
  const turns = [];
  const sessionIds = [];
  let sessionId = null;
  let broken = false;
  for (const [index, prompt] of TURN_PROMPTS.entries()) {
    const turn = index + 1;
    const result = broken ? null : await callClaude(options, prompt, sessionId, workdir, runDirectory);
    if (result === null) broken = true;
    const text = typeof result?.result === 'string' ? result.result : null;
    if (typeof result?.session_id === 'string') {
      sessionId = result.session_id;
      sessionIds.push(sessionId);
    }
    const score = text === null || turn === COMPACT_TURN ? null : scoreProse(text);
    turns.push({ turn, prompt, text, score });
    if (result !== null) fs.writeFileSync(path.join(runDirectory, `turn-${turn}.json`), `${JSON.stringify(result, null, 2)}\n`);
  }
  const compaction = compactionConfirmed(sessionIds) ? 'confirmed' : 'UNRUN';
  const summary = { ...verdictFor(turns, broken ? null : commitBody(workdir)), compaction, turns };
  fs.writeFileSync(path.join(runDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
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
  const runs = Array.from({ length: options.runs }, (_, index) => index + 1);
  const summaries = [];
  await runPool(runs, options.concurrency, async (run) => {
    const summary = await runSession(options, path.join(out, String(run)));
    summaries.push({ run, summary });
    console.log(`run ${run}: ${summary.verdict} (compaction ${summary.compaction})`);
  });
  summaries.sort((left, right) => left.run - right.run);
  printTable(summaries);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
