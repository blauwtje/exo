#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { UsageError, parseFlags, isMain } from '#script-flags';

const JUDGE_PROMPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../benchmarks/pressure/judge.md');
const CASE_HEADING = /^##\s+`?([^\s`]+\.txt)`?\s*$/;
const BULLET = /^(?:[-*+]|\d+[.)])\s+/;
const TAG = /`grade:\s*([^`]+)`\s*$/;
const REGEX_TAG = /^answer\s+(=~|!~)\s+\/(.*)\/([a-z]*)$/s;
const OTHER_TAGS = { file: 'file', 'no file': 'no-file', run: 'run' };
const MARGIN = /^margin:\s*(\d*\.?\d+)\s*$/i;
const CLAUSE_MARK = /;|\b(?:and|but|or|while|because|since|after|although|then)\b/gi;
const USAGE = 'usage: pressure-grade.mjs --check <criteria.md> [<criteria.md> ...]\nParses each criteria file and prints its case count and pass-line count; exits 1 if any file has an untagged top-level bullet.\nPrints a LINT line for each judge line with more than MAX_CLAUSES clauses (one claim per judge line); lint never changes the exit code.';
export const JUDGE_VOTES = 3;
export const DEFAULT_MARGIN = 0.2;
export const UNSTABLE_BELOW = 0.8;
export const MAX_CLAUSES = 2;
const Z95 = 1.959964;
const NEEDED_N_LIMIT = 1000;

function parseTag(body, where) {
  const text = body.trim();
  if (text === 'judge') return { kind: 'judge' };
  const regex = REGEX_TAG.exec(text);
  if (regex) {
    try {
      new RegExp(regex[2], regex[3]);
      return { kind: regex[1] === '=~' ? 'match' : 'no-match', source: regex[2], flags: regex[3] };
    } catch (error) {
      throw new Error(`${where}: bad regex: ${error.message}`);
    }
  }
  for (const [prefix, kind] of Object.entries(OTHER_TAGS)) {
    if (text.startsWith(`${prefix} `)) return { kind, arg: text.slice(prefix.length).trim() };
  }
  throw new Error(`${where}: unknown grade tag '${text}'`);
}

export function parseCriteria(markdown) {
  const groups = new Map();
  const notes = new Map();
  let scope = null;
  let last = null;
  markdown.split('\n').forEach((raw, index) => {
    const heading = /^#{1,6}\s/.test(raw);
    if (heading) {
      scope = CASE_HEADING.exec(raw)?.[1] ?? null;
      last = null;
      return;
    }
    const bullet = BULLET.exec(raw);
    if (!bullet) {
      if (!raw.trim() || MARGIN.test(raw.trim())) return;
      if (/^\s/.test(raw) || scope === null) {
        if (last) last.context.push(raw.trim());
      } else {
        notes.set(scope, [...(notes.get(scope) ?? []), raw.trim()]);
      }
      return;
    }
    const where = `line ${index + 1}`;
    const tag = TAG.exec(raw);
    if (!tag) throw new Error(`${where}: top-level bullet has no \`grade: ...\` tag`);
    if (!groups.has(scope)) groups.set(scope, []);
    last = { text: raw.slice(bullet[0].length, tag.index).trim(), tag: parseTag(tag[1], where), context: [] };
    groups.get(scope).push(last);
  });
  return [...groups].map(([name, lines]) => ({
    case: name,
    lines: lines.map((line) => ({ ...line, context: [...(notes.get(name) ?? []), ...line.context] }))
  }));
}

// why: the margin is the non-inferiority bound a case states before its run, so it lives beside the lines it judges.
export function parseMargins(markdown) {
  const margins = new Map();
  let scope = null;
  markdown.split('\n').forEach((raw, index) => {
    if (/^#{1,6}\s/.test(raw)) {
      scope = CASE_HEADING.exec(raw)?.[1] ?? null;
      return;
    }
    const value = MARGIN.exec(raw.trim())?.[1];
    if (value === undefined) return;
    const margin = Number(value);
    if (!(margin > 0 && margin <= 1)) throw new Error(`line ${index + 1}: margin needs a number above 0 and at most 1, got '${value}'`);
    margins.set(scope, margin);
  });
  return margins;
}

export function marginFor(margins, caseFile) {
  return margins.get(caseFile) ?? margins.get(null) ?? DEFAULT_MARGIN;
}

export function judgeClauses(text) {
  const bare = text.replace(/`[^`]*`/g, ' ').replace(/\([^)]*\)/g, ' ');
  return 1 + (bare.match(CLAUSE_MARK) ?? []).length;
}

export function lintCriteria(markdown) {
  const found = [];
  markdown.split('\n').forEach((raw, index) => {
    const tag = TAG.exec(raw);
    const bullet = BULLET.exec(raw);
    if (!tag || !bullet || tag[1].trim() !== 'judge') return;
    const clauses = judgeClauses(raw.slice(bullet[0].length, tag.index));
    if (clauses > MAX_CLAUSES) found.push({ line: index + 1, clauses });
  });
  return found;
}

export function linesForCase(parsed, caseFile) {
  return parsed.filter((group) => group.case === null || group.case === caseFile).flatMap((group) => group.lines);
}

function judgeVote(line, answer, judge) {
  const template = fs.readFileSync(JUDGE_PROMPT, 'utf8');
  const prompt = template
    .replace('{{RUBRIC}}', () => line.text)
    .replace('{{CONTEXT}}', () => line.context.join('\n') || 'none')
    .replace('{{ANSWER}}', () => answer);
  const reply = judge(prompt).trim();
  const [verdict, ...reason] = reply.split('\n');
  const word = /^\W*(PASS|FAIL)\b/.exec(verdict)?.[1];
  if (!word) return { pass: false, reason: `unreadable judge reply: ${reply.slice(0, 80)}` };
  return { pass: word === 'PASS', reason: reason.join(' ').trim() || word.toLowerCase() };
}

// why: one doubtful judge call flips a line at small n, so the majority of several calls decides and their agreement shows how far to trust it.
function judgeLine(line, answer, judge, votes) {
  const cast = Array.from({ length: votes }, () => judgeVote(line, answer, judge));
  const passes = cast.filter((vote) => vote.pass).length;
  const pass = passes * 2 > votes;
  const agreement = Math.max(passes, votes - passes) / votes;
  const reason = cast.find((vote) => vote.pass === pass).reason;
  return { pass, reason, votes: cast.map((vote) => vote.pass), agreement, unstable: agreement < UNSTABLE_BELOW };
}

export function defaultJudge(judgeCell) {
  const [model, effort] = judgeCell.split(':');
  return (prompt) => {
    const run = spawnSync('claude', ['-p', prompt, '--model', model, '--effort', effort, '--strict-mcp-config'], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`judge call failed: ${run.stderr.slice(0, 200)}`);
    return run.stdout;
  };
}

function globMatches(pattern, dir) {
  return fs.globSync(pattern, { cwd: dir });
}

export function gradeLine(line, { answer, dir, judge, votes = JUDGE_VOTES }) {
  const { tag, text } = line;
  if (tag.kind === 'match' || tag.kind === 'no-match') {
    const found = new RegExp(tag.source, tag.flags.replace(/[gy]/g, '')).test(answer);
    return { text, pass: found === (tag.kind === 'match'), reason: `${found ? 'matched' : 'no match for'} /${tag.source}/${tag.flags}` };
  }
  if (tag.kind === 'file' || tag.kind === 'no-file') {
    const found = globMatches(tag.arg, dir);
    const pass = (found.length > 0) === (tag.kind === 'file');
    return { text, pass, reason: found.length ? `found ${found.join(', ')}` : `nothing matches ${tag.arg}` };
  }
  if (tag.kind === 'run') {
    const run = spawnSync('bash', ['-c', tag.arg], { cwd: dir, encoding: 'utf8' });
    return { text, pass: run.status === 0, reason: `exit ${run.status}` };
  }
  try {
    return { text, ...judgeLine(line, answer, judge, votes) };
  } catch (error) {
    return { text, pass: false, reason: error.message };
  }
}

// why: a run with a failed deterministic line fails whatever the judge says, so its judge calls would cost money and change nothing.
export function gradeRun({ case: caseFile, arm, run, lines, answer, dir, judge, votes }) {
  const graded = lines.map((line) => (line.tag.kind === 'judge' ? undefined : gradeLine(line, { answer, dir, judge, votes })));
  const blocked = graded.some((line) => line !== undefined && !line.pass);
  return {
    case: caseFile,
    arm,
    run,
    lines: lines.map((line, index) => graded[index] ?? (blocked
      ? { text: line.text, pass: false, reason: 'skipped: a deterministic line failed', skipped: true }
      : gradeLine(line, { answer, dir, judge, votes })))
  };
}

function wilson(passes, n) {
  const rate = passes / n;
  const spread = Z95 * Math.sqrt(rate * (1 - rate) / n + Z95 ** 2 / (4 * n ** 2));
  const centre = rate + Z95 ** 2 / (2 * n);
  const scale = 1 + Z95 ** 2 / n;
  return { rate, low: (centre - spread) / scale, high: (centre + spread) / scale };
}

// why: the Newcombe hybrid score interval stays inside -1 to 1 and holds at 3 runs, where the plain normal interval does not.
export function newcombe(passesA, nA, passesB, nB) {
  const a = wilson(passesA, nA);
  const b = wilson(passesB, nB);
  const delta = a.rate - b.rate;
  return [delta - Math.sqrt((a.rate - a.low) ** 2 + (b.high - b.rate) ** 2), delta + Math.sqrt((a.high - a.rate) ** 2 + (b.rate - b.low) ** 2)];
}

export function verdictFor([low, high], margin) {
  if (low > -margin) return 'PASS';
  if (high < -margin) return 'FAIL';
  return 'INCONCLUSIVE';
}

// why: an inconclusive verdict helps only with the runs per arm that would settle it, found by scaling the observed rates.
export function runsNeeded(rateA, rateB, margin) {
  for (let n = 2; n <= NEEDED_N_LIMIT; n += 1) {
    if (verdictFor(newcombe(Math.round(rateA * n), n, Math.round(rateB * n), n), margin) !== 'INCONCLUSIVE') return n;
  }
  return null;
}

export function aggregate(grades, { threshold = 1, margin = DEFAULT_MARGIN, margins = new Map() } = {}) {
  const cases = [...new Set(grades.map((grade) => grade.case))];
  return cases.map((caseFile) => {
    const rates = {};
    const counts = {};
    for (const arm of new Set(grades.filter((grade) => grade.case === caseFile).map((grade) => grade.arm))) {
      const runs = grades.filter((grade) => grade.case === caseFile && grade.arm === arm);
      const passed = runs.filter((grade) => grade.lines.every((line) => line.pass)).length;
      counts[arm] = { passed, runs: runs.length };
      rates[arm] = passed / runs.length;
    }
    const other = Object.keys(rates).find((arm) => arm !== 'with');
    const bound = margins.get(caseFile) ?? margins.get(null) ?? margin;
    const unstable = grades.filter((grade) => grade.case === caseFile).reduce((sum, grade) => sum + grade.lines.filter((line) => line.unstable).length, 0);
    if (other === undefined || rates.with === undefined) {
      // why: with no second arm there is no difference to bound, so the single-arm bar stays the only verdict.
      return { case: caseFile, rates, counts, comparison: null, pass: rates.with !== undefined && rates.with >= threshold, verdict: rates.with !== undefined && rates.with >= threshold ? 'PASS' : 'FAIL', delta: null, ci: null, margin: bound, needed: null, unstable, noSkillEffect: false };
    }
    const ci = newcombe(counts.with.passed, counts.with.runs, counts[other].passed, counts[other].runs);
    const verdict = verdictFor(ci, bound);
    return {
      case: caseFile, rates, counts, comparison: other, pass: verdict === 'PASS', verdict, delta: rates.with - rates[other], ci, margin: bound,
      needed: verdict === 'INCONCLUSIVE' ? runsNeeded(rates.with, rates[other], bound) : null,
      unstable,
      noSkillEffect: verdict === 'PASS' && ci[0] <= 0 && ci[1] >= 0
    };
  });
}

function main(argv) {
  const start = argv.indexOf('--check');
  let end = start + 1;
  while (start >= 0 && end < argv.length && !argv[end].startsWith('--')) end += 1;
  const files = start >= 0 ? argv.slice(start + 1, end) : [];
  const flags = parseFlags([...argv.slice(0, start + 2), ...argv.slice(end)], { check: 'value' }, { usage: USAGE });
  if (!flags.check) throw new UsageError('--check needs a criteria file');
  let failed = false;
  for (const file of files) {
    try {
      const parsed = parseCriteria(fs.readFileSync(file, 'utf8'));
      const count = parsed.reduce((sum, group) => sum + group.lines.length, 0);
      console.log(`${file}: ${parsed.length} scopes, ${count} pass lines`);
      parseMargins(fs.readFileSync(file, 'utf8'));
      for (const { line, clauses } of lintCriteria(fs.readFileSync(file, 'utf8'))) {
        console.log(`LINT ${file}:${line}: judge line has ${clauses} clauses, more than ${MAX_CLAUSES}; one claim per judge line`);
      }
    } catch (error) {
      console.error(`${file}: ${error.message}`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
