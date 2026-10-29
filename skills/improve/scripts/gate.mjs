#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';

const FLAT_RUN = 3;
const SAME_IDEA = 0.6;
const USAGE = 'usage: node gate.mjs --root <dir> --tag <tag> --idea <path> (round.mjs calls gate() directly)';

const keyText = (key) => (typeof key === 'string' ? key : `${key?.area}/${key?.lever}/${key?.target}`);
const areaOf = (key) => keyText(key).split('/')[0];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

// why: git's own `:(glob)` pathspec decides membership, the same matcher setup probes with, so no pattern class can disagree; the files go into a throwaway index, so a path that does not exist yet is matched too.
const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';

export class ScopeError extends Error {}

export function matchScope(files, entries) {
  const rels = files.map((file) => path.posix.normalize(file));
  const specs = entries.map((entry) => `:(glob)${path.posix.normalize(entry).replace(/\/$/, '')}`);
  if (rels.length === 0 || specs.length === 0) return new Set();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-scope-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const git = (args, input) => {
    const run = spawnSync('git', args, { cwd: dir, env, input, encoding: 'utf8' });
    if (run.status !== 0) throw new ScopeError(`git ${args[0]} failed: ${run.stderr.trim()}`);
    return run.stdout;
  };
  try {
    git(['init', '-q']);
    git(['update-index', '--add', '--index-info'], rels.map((rel) => `100644 ${EMPTY_BLOB}\t${rel}\n`).join(''));
    return new Set(git(['ls-files', '-z', '--', ...specs]).split('\0').filter(Boolean));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function outOfScope(files, cfg) {
  const rels = files.map((file) => path.posix.normalize(file));
  let readOnly;
  let inScope = null;
  try {
    readOnly = matchScope(files, cfg.readOnly ?? []);
    const scope = cfg.scope ?? [];
    if (scope.length > 0) inScope = matchScope(files, scope);
  } catch (error) {
    if (!(error instanceof ScopeError)) throw error;
    return `scope check failed: ${error.message}`;
  }
  const at = rels.findIndex((rel) => readOnly.has(rel) || (inScope && !inScope.has(rel)));
  return at < 0 ? null : `file out of scope: ${files[at]}`;
}

export const RATIO_LINE = /^(\S+) ratio=(\d+(?:\.\d+)?)/gm;

// why: each `<id> ratio=<n>` line is one case; its headroom is the distance to the best bound, 0 when lower is better and 1 when higher is.
function caseHeadroom(root, direction) {
  const source = path.join(root, '.exo', 'improve', 'run.log');
  if (!fs.existsSync(source)) return null;
  const best = direction === 'higher' ? 1 : 0;
  const cases = [...fs.readFileSync(source, 'utf8').matchAll(RATIO_LINE)].map((m) => ({ id: m[1], room: Math.abs(Number(m[2]) - best) }));
  return cases.length === 0 ? null : cases;
}

function checkShape(idea) {
  const parts = idea.parts ?? [idea.key];
  if (!idea.key?.area || !idea.key?.lever || !idea.key?.target) return 'key needs area, lever and target';
  if (parts.length < 1 || parts.length > 3) return 'an idea bundles 1 to 3 parts';
  if (parts.some((part) => areaOf(part) !== idea.key.area)) return 'parts must share the key area';
  return null;
}

function checkFiles(idea, cfg) {
  const files = idea.files ?? [];
  return files.length === 0 ? 'idea names no files' : outOfScope(files, cfg);
}

function checkEvidence(idea) {
  const text = String(idea.evidence ?? '');
  return /[\w./-]+:\d+/.test(text) || /\brow \d+\b/i.test(text) ? null : 'evidence needs file:line or an earlier row';
}

const tokensOf = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []);
const ideaText = (line) => line.mechanism ?? [line.key, ...(line.parts ?? [])].map(keyText).join(' ');

function overlap(left, right) {
  const shared = [...left].filter((token) => right.has(token)).length;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

const flatTail = (live) => {
  const tail = live.slice(-FLAT_RUN);
  return tail.length === FLAT_RUN && tail.every((line) => line.flat);
};

function checkHistory(idea, ideas) {
  const lifted = new Set([idea.revisits, ...(idea.merges ?? [])].filter((round) => round !== undefined));
  const mine = new Set([idea.key, ...(idea.parts ?? [])].map(keyText));
  const live = ideas.filter((line) => !line.crash);
  const compared = live.filter((line) => !lifted.has(line.round));
  const seen = new Set(compared.flatMap((line) => [line.key, ...(line.parts ?? [])].map(keyText)));
  const dup = [...mine].find((key) => seen.has(key));
  if (dup) return `duplicate key ${dup}`;
  const words = tokensOf(ideaText(idea));
  const reworded = compared.find((line) => overlap(words, tokensOf(ideaText(line))) >= SAME_IDEA);
  if (reworded) return `reworded duplicate of round ${reworded.round}: revisit or merge it, or change the mechanism`;
  if (flatTail(live)) {
    const touched = new Set(ideas.map((line) => areaOf(line.key)));
    if (touched.has(idea.key.area)) return `${FLAT_RUN} flat rounds in a row: pick an untouched area, not ${idea.key.area}`;
  }
  return null;
}

// why: the idea's own `expected` is never trusted; its targeted cases' mean headroom, summed over its parts and capped at the total, must exceed 2*sd.
function checkHeadroom(idea, cases, sd) {
  if (cases === null) return null;
  const total = cases.reduce((sum, item) => sum + item.room, 0) / cases.length;
  const targets = new Set((idea.parts ?? [idea.key]).flatMap((part) => String(part?.target ?? '').split(/[\s,]+/)));
  const hit = cases.filter((item) => targets.has(item.id));
  const room = hit.length === 0 ? total : Math.min(total, hit.reduce((sum, item) => sum + item.room, 0) / cases.length);
  return room < 2 * (sd ?? 0) ? `headroom ${room.toFixed(3)} is below 2*sd (${(2 * (sd ?? 0)).toFixed(3)})` : null;
}

export function gate({ root, tag, idea }) {
  const dir = path.join(root, '.exo', 'improve');
  const cfg = readJson(path.join(dir, `${tag}.json`));
  const ideas = readLines(path.join(dir, `${tag}.ideas.jsonl`));
  const found = checkShape(idea)
    ?? checkFiles(idea, cfg)
    ?? checkEvidence(idea)
    ?? checkHistory(idea, ideas)
    ?? checkHeadroom(idea, caseHeadroom(root, cfg.direction), cfg.sd);
  const radical = flatTail(ideas.filter((line) => !line.crash));
  return found ? { ok: false, reason: found, radical } : { ok: true, radical };
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { root: 'string', tag: 'string', idea: 'string' }, { usage: USAGE });
    for (const name of ['root', 'tag', 'idea']) if (!flags[name]) throw new UsageError(`--${name} is required`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const result = gate({ root: flags.root, tag: flags.tag, idea: readJson(flags.idea) });
  if (result.radical) process.stdout.write('NOTE radical\n');
  process.stdout.write(result.ok ? 'PASS\n' : `REJECT ${result.reason}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
