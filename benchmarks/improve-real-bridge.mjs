import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { environmentMs } from '#script-flags';
import { SPLITS, isRouting, locateScore, pristineView, routingScore, scorerSpend } from './improve-real-copy.mjs';

const SCORER_MS = 30 * 60 * 1000;
const BRIDGE_POLL_MS = 500;
const CLIENT_POLL_MS = 500;
const CLIENT_WAIT_MS = 30 * 60 * 1000;
const REQUEST_FILE = /^request-(\d+)\.json$/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scorerArgs(target, outFile, transcripts) {
  if (isRouting(target)) {
    return ['benchmarks/routing.mjs', '--full', '--skill', SPLITS[target].skill, '--arms', 'hook', '--runs', '1', '--out', outFile];
  }
  return ['benchmarks/locate-recall.mjs', '--full', '--models', 'sonnet', '--runs', '1', '--concurrency', '3', '--out', outFile, '--transcripts', transcripts];
}

function seedRouting(outFile) {
  const seed = { cells: ['sonnet:low'], arms: ['hook'], runs: 1, results: {}, errors: [], sessions: [], split: 'train', prompts: [], hashes: {} };
  fs.writeFileSync(outFile, `${JSON.stringify(seed)}\n`);
}

function runNode(args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`scorer ${args[0]} ended with ${signal ?? `exit ${code}`}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

export async function realScorer({ view, target, outFile, transcripts }) {
  if (isRouting(target)) seedRouting(outFile);
  await runNode(scorerArgs(target, outFile, transcripts), view, environmentMs('EXO_IMPROVE_REAL_SCORER_MS', SCORER_MS));
}

function scoreOf(target, outJson) {
  return isRouting(target) ? routingScore(outJson, SPLITS[target].skill) : locateScore(outJson);
}

async function scoreOnce({ repo, target, split, targetText, scorer }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-real-score-'));
  try {
    const view = pristineView({ repo, target, split, targetText, dest: path.join(dir, 'view') });
    const outFile = path.join(dir, 'out.json');
    await scorer({ view, target, split, outFile, transcripts: path.join(dir, 'transcripts') });
    const text = fs.readFileSync(outFile, 'utf8');
    const outJson = JSON.parse(text);
    return { score: scoreOf(target, outJson), spend: scorerSpend(outJson), text };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function scoreTarget({ repo, target, split, targetText, runs, scorer = realScorer }) {
  const results = [];
  for (let run = 0; run < runs; run += 1) {
    results.push(await scoreOnce({ repo, target, split, targetText, scorer }));
  }
  const scores = results.map((result) => result.score);
  return {
    scores,
    mean: mean(scores),
    spend: results.reduce((sum, result) => sum + result.spend, 0),
    outs: results.map((result) => result.text)
  };
}

function clientSource({ stateDir, target }) {
  const constants = { stateDir, targetFile: SPLITS[target].file, waitMs: CLIENT_WAIT_MS, pollMs: CLIENT_POLL_MS };
  return `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const settings = ${JSON.stringify(constants)};
const home = path.dirname(fileURLToPath(import.meta.url));

function positive(name, fallback) {
  const text = process.env[name] ?? '';
  return /^[1-9]\\d*$/.test(text) ? Number(text) : fallback;
}

function nextNumber() {
  const used = fs.readdirSync(settings.stateDir).map((name) => /^request-(\\d+)\\.json$/.exec(name)).filter(Boolean).map((match) => Number(match[1]));
  return Math.max(0, ...used) + 1;
}

function writeAtomic(file, text) {
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function awaitResult(file) {
  const pollMs = positive('EXO_SCORE_POLL_MS', settings.pollMs);
  const rounds = Math.ceil(positive('EXO_SCORE_WAIT_MS', settings.waitMs) / pollMs);
  for (let round = 0; round < rounds; round += 1) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    await sleep(pollMs);
  }
  return { error: 'no result before the deadline' };
}

async function main() {
  const text = fs.readFileSync(path.join(home, settings.targetFile), 'utf8');
  const n = nextNumber();
  writeAtomic(path.join(settings.stateDir, 'request-' + n + '.json'), JSON.stringify({ n, text }));
  const result = await awaitResult(path.join(settings.stateDir, 'result-' + n + '.json'));
  if (result.refused) {
    process.stderr.write('score.mjs refuses: ' + result.calls + ' calls used\\n');
    process.exit(1);
  }
  if (typeof result.score !== 'number') {
    process.stderr.write('score.mjs failed: ' + (result.error ?? 'no score') + '\\n');
    process.exit(1);
  }
  process.stdout.write(Number(result.score.toFixed(4)) + '\\n');
}

main();
`;
}

export function writeScoreClient({ dir, stateDir, target }) {
  const file = path.join(dir, 'score.mjs');
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, clientSource({ stateDir, target }), { mode: 0o444 });
  return file;
}

function writeAtomic(file, value) {
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

function pendingNumbers(stateDir) {
  return fs.readdirSync(stateDir)
    .map((name) => REQUEST_FILE.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter((n) => !fs.existsSync(path.join(stateDir, `result-${n}.json`)))
    .sort((a, b) => a - b);
}

function readRequest(stateDir, n) {
  try {
    const request = JSON.parse(fs.readFileSync(path.join(stateDir, `request-${n}.json`), 'utf8'));
    return typeof request.text === 'string' ? request : null;
  } catch {
    return null;
  }
}

export function startScoreBridge({ stateDir, repo, target, calls, score = scoreTarget }) {
  fs.mkdirSync(stateDir, { recursive: true });
  const pollMs = environmentMs('EXO_SCORE_BRIDGE_POLL_MS', BRIDGE_POLL_MS);
  const state = { used: 0, spend: 0, history: [], stopped: false };

  async function handle(n) {
    const request = readRequest(stateDir, n);
    if (!request) return;
    const resultFile = path.join(stateDir, `result-${n}.json`);
    if (state.used >= calls) return writeAtomic(resultFile, { refused: true, calls: state.used });
    state.used += 1;
    try {
      const scored = await score({ repo, target, split: 'train', targetText: request.text, runs: 1 });
      state.spend += scored.spend;
      state.history.push({ n, score: scored.mean, spend: scored.spend });
      writeAtomic(resultFile, { score: scored.mean });
    } catch (error) {
      state.history.push({ n, error: error.message, spend: 0 });
      writeAtomic(resultFile, { error: error.message });
    }
  }

  async function loop() {
    while (!state.stopped) {
      for (const n of pendingNumbers(stateDir)) {
        if (state.stopped) break;
        await handle(n);
      }
      await sleep(pollMs);
    }
  }

  const running = loop();
  return {
    async stop() {
      state.stopped = true;
      await running;
      return { calls: state.used, spend: state.spend, history: state.history };
    }
  };
}
