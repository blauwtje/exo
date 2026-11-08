#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, readJsonOrNull } from './basics.mjs';
import { isMain, parseFlags, UsageError } from '../lib/script-flags.mjs';

const USAGE = 'Usage: node harvest-cases.mjs <graded run dir> --out <cases dir> [--dry-run]\nWrites one replay case folder per cell graded fail, with personal data scrubbed.\n';
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

function escaped(text) {
  return text.replace(ESCAPE, '\\$&');
}

function personalPatterns(home, user) {
  const patterns = [
    [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'user@example.com'],
    [/\b(?:sk|ghp|gho|xox[bap])[-_][A-Za-z0-9_-]{10,}/g, '[token]'],
    [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '0.0.0.0'],
    [/\/(?:Users|home)\/[^/\s"']+/g, '~']
  ];
  if (home.length >= 2) patterns.splice(3, 0, [new RegExp(escaped(home), 'g'), '~']);
  if (user.length >= 3) patterns.push([new RegExp(`\\b${escaped(user)}\\b`, 'g'), 'user']);
  return patterns;
}

export function scrub(text, { home = os.homedir(), user = os.userInfo().username } = {}) {
  return personalPatterns(home, user).reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function cellsUnder(directory) {
  const isCell = ['result.json', 'case.json'].every((name) => fs.existsSync(path.join(directory, name)));
  if (isCell) return [directory];
  if (!fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory).sort().flatMap((name) => cellsUnder(path.join(directory, name)));
}

function failedOutput(cell) {
  const grade = readJsonOrNull(path.join(cell, 'grade.json'));
  if (grade?.grade !== 'fail') return null;
  const result = readJson(path.join(cell, 'result.json'));
  if (typeof result.result !== 'string' || result.result === '') return null;
  return { grade, output: result.result };
}

function cellKey({ cell, relative }) {
  if (relative !== '') return relative.split(path.sep).join('-');
  const digest = crypto.createHash('sha256').update(cell).digest('hex').slice(0, 8);
  return `${path.basename(cell)}-${digest}`;
}

function scrubbed(value, clean) {
  if (typeof value === 'string') return clean(value);
  if (Array.isArray(value)) return value.map((item) => scrubbed(item, clean));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubbed(item, clean)]));
}

export function harvestedCase({ cell = '', relative, caseDef, grade, scrubOptions }) {
  const clean = (text) => scrub(text, scrubOptions);
  return {
    id: clean(`harvest-${cellKey({ cell, relative })}`),
    kind: 'case',
    replay: null,
    task: clean(caseDef.task),
    grade: scrubbed(caseDef.grade, clean),
    provenance: { type: 'graded-session', ref: clean(caseDef.id), evidence: clean(grade.evidence ?? '') },
    transcript: 'none',
    constructed: false,
    ready: true
  };
}

function writeCase({ folder, definition, output }) {
  fs.mkdirSync(path.join(folder, 'input'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'input', 'failed-answer.md'), `${output}\n`);
  fs.writeFileSync(path.join(folder, 'prompt.md'), `${definition.task}\n`);
  fs.writeFileSync(path.join(folder, 'case.json'), `${JSON.stringify(definition, null, 2)}\n`);
}

export function harvest({ target, out, dryRun, scrubOptions }) {
  const written = [];
  for (const cell of cellsUnder(path.resolve(target))) {
    const failed = failedOutput(cell);
    if (failed === null) continue;
    const caseDef = readJson(path.join(cell, 'case.json'));
    const definition = harvestedCase({ cell, relative: path.relative(path.resolve(target), cell), caseDef, grade: failed.grade, scrubOptions });
    const folder = path.join(out, definition.id);
    written.push(folder);
    if (!dryRun) writeCase({ folder, definition, output: scrub(failed.output, scrubOptions) });
  }
  return written;
}

function main(argv) {
  try {
    const flagTokens = argv.filter((token, index) => token.startsWith('--') || argv[index - 1] === '--out');
    const flags = parseFlags(flagTokens, { out: 'string', 'dry-run': 'boolean' }, { usage: USAGE });
    const targets = argv.filter((token) => !flagTokens.includes(token));
    if (targets.length !== 1 || !flags.out) throw new UsageError(USAGE);
    const dryRun = flags['dry-run'] === true;
    const written = harvest({ target: targets[0], out: path.resolve(flags.out), dryRun });
    console.log(`${dryRun ? 'would write' : 'wrote'} ${written.length} case folders`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return error instanceof UsageError ? 2 : 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
