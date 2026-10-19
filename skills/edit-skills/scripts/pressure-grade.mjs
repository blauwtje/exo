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
const USAGE = 'usage: pressure-grade.mjs --check <criteria.md> [<criteria.md> ...]\nParses each criteria file and prints its case count and pass-line count; exits 1 if any file has an untagged top-level bullet.';

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
      if (!raw.trim()) return;
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

export function linesForCase(parsed, caseFile) {
  return parsed.filter((group) => group.case === null || group.case === caseFile).flatMap((group) => group.lines);
}

function judgeLine(line, answer, judge) {
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

export function gradeLine(line, { answer, dir, judge }) {
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
    return { text, ...judgeLine(line, answer, judge) };
  } catch (error) {
    return { text, pass: false, reason: error.message };
  }
}

export function gradeRun({ case: caseFile, arm, run, lines, answer, dir, judge }) {
  return { case: caseFile, arm, run, lines: lines.map((line) => gradeLine(line, { answer, dir, judge })) };
}

export function aggregate(grades, { threshold = 1 } = {}) {
  const cases = [...new Set(grades.map((grade) => grade.case))];
  return cases.map((caseFile) => {
    const rates = {};
    for (const arm of new Set(grades.filter((grade) => grade.case === caseFile).map((grade) => grade.arm))) {
      const runs = grades.filter((grade) => grade.case === caseFile && grade.arm === arm);
      rates[arm] = runs.filter((grade) => grade.lines.every((line) => line.pass)).length / runs.length;
    }
    const other = Object.keys(rates).find((arm) => arm !== 'with');
    const passes = (arm) => rates[arm] !== undefined && rates[arm] >= threshold;
    const delta = other === undefined || rates.with === undefined ? null : rates.with - rates[other];
    return { case: caseFile, rates, comparison: other ?? null, pass: passes('with'), delta, noSkillEffect: other !== undefined && passes('with') && passes(other) };
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
