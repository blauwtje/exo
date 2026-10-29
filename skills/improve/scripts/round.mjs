#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runTreeSync } from '../../../lib/process-tree.mjs';
import { isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';
import { outOfScope } from './scope.mjs';

const USAGE = 'usage: node round.mjs --root <dir> --tag <tag> --commit <hash>\nOutput: ROW <hash> <score> keep|discard|crash best=<score>, or STOP <reason> <detail> with exit 1 (scorer-changed, reset-failed, no-keep).';
const NO_KEEP_STOP = 10;
const BRIEF_ROWS = 15;
const TEMPLATE = new URL('../references/worker.md', import.meta.url);
const SKILL_DIR = path.dirname(path.dirname(new URL(import.meta.url).pathname));

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: run.status === 0, out: (run.stdout ?? '').trim() };
}

export function filesUnder(cwd, entry) {
  const full = path.join(cwd, entry);
  if (!fs.existsSync(full)) return [];
  if (!fs.statSync(full).isDirectory()) return [entry];
  return fs.readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => path.relative(cwd, path.join(item.parentPath, item.name)));
}

export function scorerHash(cwd, entries) {
  const hash = crypto.createHash('sha256');
  const files = [...new Set(entries.flatMap((entry) => filesUnder(cwd, entry)))].sort();
  for (const file of files) hash.update(`${file}\0`).update(fs.readFileSync(path.join(cwd, file))).update('\0');
  return hash.digest('hex');
}

export function readScore(output, regex) {
  const last = [...output.matchAll(new RegExp(regex, 'g'))].at(-1);
  const value = last === undefined ? NaN : Number(last[1] ?? last[0]);
  return Number.isFinite(value) ? value : null;
}

export const readRows = (file) => fs.readFileSync(file, 'utf8').split('\n').slice(1).filter(Boolean).map((line) => {
  const [commit, score, status, ...description] = line.split('\t');
  return { commit, score: Number(score), status, description: description.join('\t') };
});

export const lastKeep = (rows) => rows.filter((row) => row.status === 'keep').at(-1);

export function writeBrief({ dir, tag, cfg, rows }) {
  const kept = lastKeep(rows);
  const history = rows.slice(-BRIEF_ROWS).map((row) => `${row.commit} ${row.score} ${row.status} ${row.description}`).join('\n');
  const values = {
    '<goal>': cfg.goal, '<scope>': cfg.scope.join(', '), '<readonly>': cfg.readOnly.join(', ') || 'none', '<command>': cfg.command,
    '<direction>': cfg.direction === 'higher' ? 'higher is better' : 'lower is better', '<worktree>': path.resolve(dir, '..', '..', cfg.worktree),
    '<base>': kept.commit, '<best>': String(kept.score), '<fastcheck>': path.join(SKILL_DIR, 'scripts', 'fast-check.mjs'),
    '<root>': path.resolve(dir, '..', '..'), '<tag>': tag, '<rows>': history,
  };
  const brief = Object.entries(values).reduce((text, [name, value]) => text.split(name).join(value), fs.readFileSync(TEMPLATE, 'utf8'));
  const file = path.join(dir, `${tag}.brief.md`);
  fs.writeFileSync(file, brief);
  return file;
}

function scoreOnce(cfg, cwd, log) {
  const run = runTreeSync(cfg.command, { cwd, timeoutMs: cfg.limit * 1000 });
  fs.writeFileSync(log, run.output);
  const score = readScore(run.output, cfg.regex);
  return { score, failed: run.status !== 0, infra: run.timedOut || (run.status === 0 && score === null) };
}

function runScore(cfg, cwd, log) {
  const first = scoreOnce(cfg, cwd, log);
  const result = first.infra ? scoreOnce(cfg, cwd, log) : first;
  return result.failed || result.score === null ? { crash: true } : { score: result.score };
}

const linesAdded = (cwd, from, to) => git(cwd, 'diff', '--numstat', from, to).out.split('\n').filter(Boolean)
  .reduce((sum, row) => { const [add, del] = row.split('\t'); return sum + (Number(add) || 0) - (Number(del) || 0); }, 0);

const gain = (cfg, score, base) => (cfg.direction === 'higher' ? score - base : base - score);

function keepOrDiscard({ cfg, cwd, kept, commit, score }) {
  const up = gain(cfg, score, kept.score);
  if (up > 0) return 'keep';
  return up === 0 && linesAdded(cwd, kept.commit, commit) < 0 ? 'keep' : 'discard';
}

function decide({ cfg, cwd, dir, commit, rows }) {
  const kept = lastKeep(rows);
  const files = git(cwd, 'diff', '--name-only', kept.commit, commit).out.split('\n').filter(Boolean);
  const refusal = outOfScope(files, cfg);
  if (refusal) return { status: 'discard', score: kept.score, kept, note: refusal };
  const result = runScore(cfg, cwd, path.join(dir, 'run.log'));
  if (result.crash) return { status: 'crash', score: 0, kept, note: 'crash' };
  return { status: keepOrDiscard({ cfg, cwd, kept, commit, score: result.score }), score: result.score, kept };
}

function record({ dir, tag, commit, outcome, cwd }) {
  const note = outcome.note ? `${outcome.note}; ` : '';
  const subject = git(cwd, 'log', '-1', '--format=%s', commit).out;
  fs.appendFileSync(path.join(dir, `${tag}.tsv`), `${commit}\t${outcome.score}\t${outcome.status}\t${note}${subject}\n`);
}

const noKeepStreak = (rows) => rows.length - 1 - rows.findLastIndex((row) => row.status === 'keep');

function runRound(flags) {
  const root = path.resolve(flags.root);
  const dir = path.join(root, '.exo', 'improve');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `${flags.tag}.json`), 'utf8'));
  const cwd = path.resolve(root, cfg.worktree);
  const finish = (line, code = 0) => { process.stdout.write(`${line}\n`); process.exit(code); };
  if (scorerHash(cwd, cfg.readOnly) !== cfg.scorerHash) finish('STOP scorer-changed score-files', 1);
  const rows = readRows(path.join(dir, `${flags.tag}.tsv`));
  const outcome = decide({ cfg, cwd, dir, commit: flags.commit, rows });
  if (outcome.status !== 'keep' && !git(cwd, 'reset', '--hard', outcome.kept.commit).ok) finish(`STOP reset-failed ${outcome.kept.commit}`, 1);
  record({ dir, tag: flags.tag, commit: flags.commit, outcome, cwd });
  const after = readRows(path.join(dir, `${flags.tag}.tsv`));
  writeBrief({ dir, tag: flags.tag, cfg, rows: after });
  process.stdout.write(`ROW ${flags.commit} ${outcome.score} ${outcome.status} best=${lastKeep(after).score}\n`);
  if (noKeepStreak(after) >= NO_KEEP_STOP) finish(`STOP no-keep ${NO_KEEP_STOP}`);
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { root: 'string', tag: 'string', commit: 'string' }, { usage: USAGE });
    for (const name of ['root', 'tag', 'commit']) if (!flags[name]) throw new UsageError(`--${name} is required`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  runRound(flags);
}

if (isMain(import.meta.url)) main();
