#!/usr/bin/env node
// replay/grade.mjs
// Grades replay cells. node grade.mjs <cellDir|runDir> [--dry-run] [--full] grades the cells under the path
// that hold a result.json and case.json, writes grade.json beside each and prints one line.
// Quick tier (default): the first 3 cells, 1 judge vote each. --full: every cell, JUDGE_CALLS votes each.
// --dry-run prints the planned cells, judge calls and cost cap, spends nothing.
//
// Grade values: pass, fail, unknown (rubric judge gave no verbatim evidence, or the cell
// errored without output), leak (set by runner.mjs, never overwritten here).
// "fail" means the model repeated the mistake the case replays.
// Regex rule: fail when any `fail` pattern matches the output; else, when `pass` is
// non-empty and none of its patterns matches, fail; else pass. A pattern is `/body/flags`
// or a bare body (flag i).
// Rubric rule: a judge on the cheapest model at low effort, blind to arm and case id, sees the rubric and the output only.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withoutParentSession, ISOLATION_ENV } from '../lean-gates.mjs';
import { parseFlags, UsageError } from '../../lib/script-flags.mjs';

export const JUDGE_MODEL = 'claude-haiku-5-5';
export const JUDGE_EFFORT = 'low';
const JUDGE_BUDGET_USD = 0.25;

export function toRegExp(text) {
  const slashed = /^\/(.*)\/([a-z]*)$/s.exec(text);
  return slashed ? new RegExp(slashed[1], slashed[2]) : new RegExp(text, 'i');
}

export function gradeRegex(rule, output) {
  const hit = (list) => (list ?? []).find((pattern) => toRegExp(pattern).test(output));
  const failed = hit(rule.fail);
  if (failed !== undefined) return { grade: 'fail', evidence: `matched fail pattern ${failed}` };
  const passes = rule.pass ?? [];
  const missed = passes.find((pattern) => !toRegExp(pattern).test(output));
  if (missed !== undefined) return { grade: 'fail', evidence: `pass pattern ${missed} did not match` };
  return { grade: 'pass', evidence: passes.length > 0 ? 'every pass pattern matched' : 'no fail pattern matched' };
}

function judgePrompt(rubric, output) {
  return [
    'You grade one answer against a rubric. The rubric says what a failing answer does and what a passing one does.',
    'Reply with one JSON object and nothing else: {"grade":"pass"|"fail","evidence":"<one line copied character for character from the ANSWER>"}.',
    'The evidence line must be a verbatim substring of the ANSWER that supports your grade; do not paraphrase it.',
    '',
    '<rubric>', rubric, '</rubric>', '', '<answer>', output, '</answer>'
  ].join('\n');
}

export function judge(rubric, output) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-judge-'));
  try {
    const run = spawnSync('claude', [
      '-p', judgePrompt(rubric, output), '--model', JUDGE_MODEL, '--effort', JUDGE_EFFORT,
      '--restricted', '--tools', '', '--strict-mcp-config', '--output-format', 'json',
      '--max-budget-usd', String(JUDGE_BUDGET_USD)
    ], { cwd, encoding: 'utf8', env: { ...withoutParentSession(process.env), ...ISOLATION_ENV }, timeout: 180000, maxBuffer: 1 << 26 });
    let result;
    try { result = JSON.parse(run.stdout); } catch { return { grade: 'unknown', evidence: 'judge output unreadable', judgeCostUsd: 0 }; }
    const costUsd = result.total_cost_usd ?? 0;
    const match = /\{[\s\S]*\}/.exec(String(result.result ?? ''));
    let verdict;
    try { verdict = JSON.parse(match?.[0] ?? ''); } catch { return { grade: 'unknown', evidence: 'judge reply not JSON', judgeCostUsd: costUsd }; }
    const evidence = typeof verdict.evidence === 'string' ? verdict.evidence.trim() : '';
    if (!['pass', 'fail'].includes(verdict.grade) || evidence === '' || !output.includes(evidence)) {
      return { grade: 'unknown', evidence: 'judge evidence not a verbatim substring', judged: verdict.grade, judgeCostUsd: costUsd };
    }
    return { grade: verdict.grade, evidence, judgeCostUsd: costUsd };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

// One call with today's single retry on unknown; a call still unknown after it casts no vote.
function judgeWithRetry(rubric, output) {
  const first = judge(rubric, output);
  if (first.grade !== 'unknown') return first;
  const second = judge(rubric, output);
  return { ...second, retried: true, judgeCostUsd: (first.judgeCostUsd ?? 0) + (second.judgeCostUsd ?? 0) };
}

// Grade = majority of valid votes over JUDGE_CALLS calls; a tie or no valid vote is unknown.
export const JUDGE_CALLS = 3;
export function judgeMajority(rubric, output, votes = JUDGE_CALLS) {
  const calls = Array.from({ length: votes }, () => judgeWithRetry(rubric, output));
  const cast = calls.map((call) => call.grade);
  const count = (value) => cast.filter((vote) => vote === value).length;
  const passes = count('pass');
  const fails = count('fail');
  const grade = passes > fails ? 'pass' : fails > passes ? 'fail' : 'unknown';
  const winner = calls.find((call) => call.grade === grade) ?? calls[0];
  return { grade, evidence: winner.evidence, votes: cast, retried: calls.some((call) => call.retried) || undefined, judgeCostUsd: calls.reduce((sum, call) => sum + (call.judgeCostUsd ?? 0), 0) };
}

export function gradeCell(cellDirectory, { judgeCalls = JUDGE_CALLS } = {}) {
  const gradeFile = path.join(cellDirectory, 'grade.json');
  const prior = fs.existsSync(gradeFile) ? JSON.parse(fs.readFileSync(gradeFile, 'utf8')) : null;
  if (prior?.grade === 'leak') return prior;
  const caseDef = JSON.parse(fs.readFileSync(path.join(cellDirectory, 'case.json'), 'utf8'));
  const result = JSON.parse(fs.readFileSync(path.join(cellDirectory, 'result.json'), 'utf8'));
  const output = typeof result.result === 'string' ? result.result : '';
  let graded;
  if (output === '') graded = { grade: 'unknown', evidence: 'cell produced no output' };
  else if (caseDef.grade.type === 'regex') graded = gradeRegex(caseDef.grade, output);
  else if (caseDef.grade.type === 'rubric') {
    graded = judgeMajority(caseDef.grade.rubric, output, judgeCalls);
    // The regex stays a free cross-check; baseline.md counts where it disagrees with the judge.
    if (caseDef.grade.pass || caseDef.grade.fail) graded = { ...graded, regex: gradeRegex(caseDef.grade, output).grade };
  }
  else graded = { grade: 'unknown', evidence: `unknown grade type ${caseDef.grade.type}` };
  fs.writeFileSync(gradeFile, `${JSON.stringify(graded, null, 2)}\n`);
  return graded;
}

function cellsUnder(directory) {
  if (fs.existsSync(path.join(directory, 'result.json')) && fs.existsSync(path.join(directory, 'case.json'))) return [directory];
  if (!fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory).sort().flatMap((name) => cellsUnder(path.join(directory, name)));
}

export const QUICK_CELLS = 3;
export const QUICK_VOTES = 1;
const USAGE = 'usage: node grade.mjs <cellDir|runDir> [--dry-run] [--full]';

export function parseGradeArguments(argv) {
  const targets = argv.filter((token) => !token.startsWith('--'));
  const flags = parseFlags(argv.filter((token) => token.startsWith('--')), { 'dry-run': 'boolean', full: 'boolean' });
  if (targets.length !== 1) throw new UsageError(USAGE);
  return { target: targets[0], dryRun: flags['dry-run'] === true, full: flags.full === true };
}

export function selectCells(cells, { full }) {
  return full ? cells : cells.slice(0, QUICK_CELLS);
}

function needsJudge(cellDirectory) {
  const gradeFile = path.join(cellDirectory, 'grade.json');
  if (fs.existsSync(gradeFile) && JSON.parse(fs.readFileSync(gradeFile, 'utf8')).grade === 'leak') return false;
  const caseDef = JSON.parse(fs.readFileSync(path.join(cellDirectory, 'case.json'), 'utf8'));
  const result = JSON.parse(fs.readFileSync(path.join(cellDirectory, 'result.json'), 'utf8'));
  return caseDef.grade.type === 'rubric' && typeof result.result === 'string' && result.result !== '';
}

export function planGrade(cells, { votes }) {
  const judgedCells = cells.filter(needsJudge).length;
  const calls = judgedCells * votes;
  return { cells: cells.length, judgedCells, calls, maxCostUsd: calls * 2 * JUDGE_BUDGET_USD };
}

function main(argv) {
  let options;
  try { options = parseGradeArguments(argv); } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    return 2;
  }
  const tier = options.full ? 'full' : 'quick';
  const votes = options.full ? JUDGE_CALLS : QUICK_VOTES;
  const cells = selectCells(cellsUnder(path.resolve(options.target)), options);
  if (options.dryRun) {
    const plan = planGrade(cells, { votes });
    console.log(`${tier} tier, ${plan.cells} cells, ${plan.calls} judge calls (${plan.judgedCells} cells x ${votes} votes), cost cap $${plan.maxCostUsd.toFixed(2)} (calls x 2 retries x $${JUDGE_BUDGET_USD} budget)`);
    return 0;
  }
  for (const cell of cells) {
    const graded = gradeCell(cell, { judgeCalls: votes });
    console.log(`${path.relative(process.cwd(), cell)}\t${graded.grade}\t${graded.evidence}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
