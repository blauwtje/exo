import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { environmentMs } from '../../lib/script-flags.mjs';
import { makeCellHome } from '../cell-home.mjs';

const PROMPT = path.join(import.meta.dirname, 'judges', 'facts.md');
const CALL_MS = 90000;
export const DEFAULT_JUDGE_MODEL = 'claude-haiku-5-5';
// why: the cap on judge calls in flight; one reply per call and 3 votes each matched the old 8 cases × 3 votes.
export const JUDGE_CONCURRENCY = 24;
export const JUDGE_VOTES = 3;

// why: no title generation or telemetry calls, so a call's cost is its reply or verdict alone.
export const QUIET_ENV = { DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };

export const callStats = { timeouts: 0, parseRetries: 0, droppedVotes: 0 };

function spawnOnce({ args, input, cwd, home, ms }) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, env: { ...process.env, ...QUIET_ENV, HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, ms);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(Object.assign(new Error(`claude call timed out after ${ms} ms`), { timedOut: true }));
      else if (code === 0) resolve(out);
      else reject(new Error(`claude failed: ${err.trim()}`));
    });
    child.stdin.end(input);
  });
}

// why: one hung `claude -p` call stalled a whole score run for 8+ minutes; kill it at the cap and retry once, then fail with a clear error.
export async function spawnClaude(options) {
  const ms = environmentMs('EXO_ADHD_CALL_MS', CALL_MS);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await spawnOnce({ ...options, ms });
    } catch (error) {
      if (!error.timedOut) throw error;
      callStats.timeouts += 1;
      if (attempt >= 2) throw new Error(`claude call timed out twice (${ms} ms each); raise EXO_ADHD_CALL_MS or check the claude CLI`);
    }
  }
}

export function requireCost(cost) {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) throw new Error('claude result lacks total_cost_usd');
  return cost;
}

export const judgePrompt = () => fs.readFileSync(PROMPT, 'utf8').trimEnd();

// why: each call sees only the question, facts and replies, in a clean HOME and empty cwd, so no judge sees the style, exo or another verdict. A caller passes one HOME per score run because a fresh HOME per call put a per-call value in the prompt prefix and broke the cache.
export async function claudeJudge({ system, input, model = DEFAULT_JUDGE_MODEL, cwd: fixedCwd, home: fixedHome }) {
  const cwd = fixedCwd ?? fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-judge-'));
  const home = fixedHome ?? makeCellHome();
  try {
    const args = ['-p', '--model', model, '--system-prompt', system, '--output-format', 'json', '--setting-sources', 'project,local', '--strict-mcp-config', '--tools', '', '--disable-slash-commands', '--exclude-dynamic-system-prompt-sections'];
    const json = JSON.parse(await spawnClaude({ args, input, cwd, home }));
    return { text: json.result, cost: requireCost(json.total_cost_usd) };
  } finally {
    if (!fixedCwd) fs.rmSync(cwd, { recursive: true, force: true });
    if (!fixedHome) fs.rmSync(home, { recursive: true, force: true });
  }
}

// why: one call judges one reply, so a strict or lenient call cannot sway sibling replies; one line per fact gives the missing facts, not just PASS or FAIL.
export function factsInput({ reply, question = '', facts = [] }) {
  return [`Question:\n${question}`, `Required facts:\n${facts.map((fact, i) => `Fact ${i + 1}: ${fact}`).join('\n')}`, `Reply:\n${reply}`].join('\n\n');
}

// why: a missing line is null, not FAIL; a format slip counted as judge:facts sent workers after a failure that did not exist.
export function parseVerdicts(text, count) {
  const verdicts = Array(count).fill(null);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const m = /^\W*(?:fact\s*)?(\d+)\W*[:.)-]\s*\**(PASS|FAIL)\b/i.exec(line);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= count) verdicts[Number(m[1]) - 1] = m[2].toUpperCase();
  }
  const bare = count === 1 && lines.length === 1 ? /^\W*(PASS|FAIL)\W*$/i.exec(lines[0]) : null;
  if (bare && verdicts[0] === null) verdicts[0] = bare[1].toUpperCase();
  // why: the judge sometimes answers bare PASS/FAIL lines without numbers; exactly one per fact, in order, is unambiguous.
  const bareLines = lines.map((line) => /^\W*(PASS|FAIL)\W*$/i.exec(line));
  if (count > 1 && verdicts.every((v) => v === null) && lines.length === count && bareLines.every(Boolean)) return bareLines.map((m) => m[1].toUpperCase());
  return verdicts;
}

// why: returns one verdict per required fact; an answer missing a fact line is asked again once, then is an error.
export async function judgeFacts({ reply, question = '', facts = [], judge = claudeJudge, model, onCost }) {
  const input = factsInput({ reply, question, facts });
  for (let attempt = 1; ; attempt += 1) {
    const out = await judge({ system: judgePrompt(), input, model });
    const text = typeof out === 'string' ? out : out.text;
    if (typeof out !== 'string' && onCost) onCost(requireCost(out.cost));
    const verdicts = parseVerdicts(text ?? '', facts.length);
    if (verdicts.every(Boolean)) return verdicts;
    const missing = verdicts.flatMap((v, i) => (v ? [] : [i + 1]));
    if (attempt >= 2) throw Object.assign(new Error(`facts judge gave no verdict for fact ${missing.join(', ')} twice; last answer: ${JSON.stringify(String(text).slice(0, 200))}`), { unparseable: true });
    callStats.parseRetries += 1;
  }
}

// why: one judge call flipped about 1 verdict in 6 between repeats on the same reply (stability run, noise.md); the majority of an odd number of parallel calls, per fact, damps that noise.
export async function judgeVote({ votes = JUDGE_VOTES, ...call }) {
  if (!Number.isInteger(votes) || votes < 1 || votes % 2 === 0) throw new Error(`judge votes must be an odd positive integer, got ${votes}`);
  const settled = await Promise.allSettled(Array.from({ length: votes }, () => judgeFacts(call)));
  const failure = settled.find((r) => r.status === 'rejected' && !r.reason?.unparseable);
  if (failure) throw failure.reason;
  // why: one vote still unparseable after its retry killed a whole score run; drop it and take the majority of the rest.
  const runs = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  callStats.droppedVotes += votes - runs.length;
  if (runs.length === 0) throw settled[0].reason;
  return (call.facts ?? []).map((_, i) => {
    const pass = runs.filter((verdicts) => verdicts[i] === 'PASS').length;
    if (pass * 2 === runs.length) throw new Error(`judge votes tied on fact ${i + 1} after dropping ${votes - runs.length} unparseable vote(s)`);
    return pass * 2 > runs.length ? 'PASS' : 'FAIL';
  });
}

export const missingFacts = (verdicts) => verdicts.flatMap((v, i) => (v === 'PASS' ? [] : [i]));

// why: the first item runs alone so it writes the judge's prompt cache; then `calls / votes` items run at once, so calls in flight stay under the cap.
async function pool(items, { concurrency = JUDGE_CONCURRENCY, votes = JUDGE_VOTES }, task) {
  if (items.length === 0) return;
  await task(items[0]);
  let next = 1;
  const worker = async () => { while (next < items.length) await task(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(concurrency / votes)), items.length - 1) }, worker));
}

const tally = () => ({ agree: 0, total: 0 });
const count = (bucket, hit) => { bucket.agree += hit ? 1 : 0; bucket.total += 1; };

// why: a built row deletes one known fact, so the judge must fail exactly that fact; failing another one too still matches the FAIL label but is a wrong per-fact verdict, which partial credit would charge.
async function agreement({ entries, judge, model, onCost, votes = JUDGE_VOTES, concurrency }) {
  const report = { ...tally(), pass: tally(), fail: tally(), built: tally(), deleted: tally() };
  await pool(entries, { concurrency, votes }, async (entry) => {
    const verdicts = await judgeVote({ reply: entry.reply, question: entry.question, facts: entry.facts, judge, model, onCost, votes });
    const missing = missingFacts(verdicts);
    const hit = (missing.length === 0 ? 'PASS' : 'FAIL') === entry.label;
    for (const bucket of [report, entry.label === 'PASS' ? report.pass : report.fail, ...(entry.built ? [report.built] : [])]) count(bucket, hit);
    if (entry.built?.fact !== undefined) {
      const index = (entry.facts ?? []).indexOf(entry.built.fact);
      count(report.deleted, index >= 0 && missing.length === 1 && missing[0] === index);
    }
  });
  return report;
}

// why: labels.jsonl may still hold rows of the dropped first-line and scannable judges; only facts rows are judged.
export const calibrate = ({ labels, judge = claudeJudge, model, onCost, votes, concurrency }) =>
  agreement({ entries: labels.filter((entry) => entry.dimension === 'facts'), judge, model, onCost, votes, concurrency });

// why: a judge that flips between repeats on the same reply makes the score move without the style changing; re-judging stored replies measures that noise alone. With partial credit a change in which facts fail moves the score too, so fact flips are counted apart.
export async function judgeStability({ items, repeats = 5, judge = claudeJudge, model, onCost, concurrency = JUDGE_CONCURRENCY, votes = JUDGE_VOTES }) {
  const calls = Array.from({ length: repeats }, () => items).flat();
  const verdicts = new Map();
  await pool(calls, { concurrency, votes }, async (item) => {
    const out = await judgeVote({ reply: item.reply, question: item.question, facts: item.facts, judge, model, onCost, votes });
    if (!verdicts.has(item.id)) verdicts.set(item.id, []);
    verdicts.get(item.id).push(out);
  });
  const own = [...verdicts.values()];
  const replyVerdicts = own.map((list) => list.map((out) => (out.every((v) => v === 'PASS') ? 'PASS' : 'FAIL')));
  const flipped = replyVerdicts.filter((list) => new Set(list).size > 1).length;
  const minority = replyVerdicts.map((list) => Math.min(...['PASS', 'FAIL'].map((v) => list.filter((x) => x === v).length)) / list.length);
  const factLists = own.flatMap((list) => list[0].map((_, i) => list.map((out) => out[i])));
  const factsFlipped = factLists.filter((list) => new Set(list).size > 1).length;
  return {
    replies: own.length, flipped, flipRate: own.length ? flipped / own.length : 0, minorityShare: own.length ? minority.reduce((a, b) => a + b, 0) / own.length : 0,
    facts: factLists.length, factsFlipped, factFlipRate: factLists.length ? factsFlipped / factLists.length : 0,
  };
}
