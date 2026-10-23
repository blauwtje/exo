import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { makeCellHome } from '../cell-home.mjs';

const PROMPTS = path.join(import.meta.dirname, 'judges');
export const DEFAULT_JUDGE_MODEL = 'claude-haiku-5-5';
export const DIMENSIONS = ['facts', 'first-line', 'scannable'];

// why: no title generation or telemetry calls, so a call's cost is its reply or verdict alone.
export const QUIET_ENV = { DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };

export function requireCost(cost) {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) throw new Error('claude result lacks total_cost_usd');
  return cost;
}

export function judgePrompt(dimension) {
  if (!DIMENSIONS.includes(dimension)) throw new Error(`unknown judge dimension: ${dimension}`);
  return fs.readFileSync(path.join(PROMPTS, `${dimension}.md`), 'utf8').trimEnd();
}

// why: each call sees one reply and one dimension, in a clean HOME and empty cwd, so no judge sees the style, exo or another verdict. A caller passes one HOME per score run because a fresh HOME per call put a per-call value in the prompt prefix and broke the cache.
export function claudeJudge({ system, input, model = DEFAULT_JUDGE_MODEL, cwd: fixedCwd, home: fixedHome }) {
  const cwd = fixedCwd ?? fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-judge-'));
  const home = fixedHome ?? makeCellHome();
  try {
    const args = ['-p', '--model', model, '--system-prompt', system, '--output-format', 'json', '--setting-sources', 'project,local', '--strict-mcp-config', '--tools', '', '--disable-slash-commands', '--exclude-dynamic-system-prompt-sections'];
    const run = spawnSync('claude', args, { cwd, input, encoding: 'utf8', maxBuffer: 1 << 24, env: { ...process.env, ...QUIET_ENV, HOME: home } });
    if (run.status !== 0) throw new Error(`judge call failed: ${run.stderr.trim()}`);
    const json = JSON.parse(run.stdout);
    return { text: json.result, cost: requireCost(json.total_cost_usd) };
  } finally {
    if (!fixedCwd) fs.rmSync(cwd, { recursive: true, force: true });
    if (!fixedHome) fs.rmSync(home, { recursive: true, force: true });
  }
}

// why: one call per (case, dimension) judges all of a case's replies; the dimension prompt stays alone and a fixed line format keeps the answer parseable.
export const batchPrompt = (dimension) => `${judgePrompt(dimension)}
You get several numbered replies to the same question. Judge each one on its own.
Output exactly one line per reply, in order: "<number>: PASS" or "<number>: FAIL". Nothing else.`;

export function parseBatch(text, count) {
  const verdicts = Array(count).fill('FAIL');
  for (const line of text.split('\n')) {
    const m = /^\W*(\d+)\W*[:.)-]\s*(PASS|FAIL)\b/i.exec(line.trim());
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= count) verdicts[Number(m[1]) - 1] = m[2].toUpperCase();
  }
  return verdicts;
}

export async function judgeBatch({ dimension, replies, question = '', facts = [], judge = claudeJudge, model, onCost }) {
  const parts = [`Question:\n${question}`];
  if (dimension === 'facts') parts.push(`Required facts:\n${facts.map((fact) => `- ${fact}`).join('\n')}`);
  replies.forEach((reply, i) => parts.push(`Reply ${i + 1}:\n${reply}`));
  const out = await judge({ system: batchPrompt(dimension), input: parts.join('\n\n'), model });
  const text = typeof out === 'string' ? out : out.text;
  if (typeof out !== 'string' && onCost) onCost(requireCost(out.cost));
  return parseBatch(text, replies.length);
}

async function agreement({ entries, judge, model }) {
  let agree = 0;
  for (const entry of entries) {
    const [verdict] = await judgeBatch({ ...entry, replies: [entry.reply], judge, model });
    if (verdict === entry.label) agree += 1;
  }
  return { agree, total: entries.length };
}

export async function calibrate({ labels, judge = claudeJudge, model }) {
  const report = {};
  for (const dimension of DIMENSIONS) {
    const entries = labels.filter((entry) => entry.dimension === dimension);
    report[dimension] = await agreement({ entries, judge, model });
  }
  return report;
}
