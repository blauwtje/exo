#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readKindTable } from '../../../lib/model-kinds.mjs';
import { runTreeSync } from '../../../lib/process-tree.mjs';
import { excludeScratch } from '../../../lib/scratch-exclude.mjs';
import { isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';
import { matchScope, ScopeError } from './gate.mjs';

const USAGE = 'usage: node setup.mjs --root <dir> --goal <text> --command <cmd> --regex <re> --direction higher|lower --scope <glob,...> [--readonly <path,...>] [--limit <s>] [--fast-check <cmd>] [--scorer <path,...>] [--tag <tag>] [--no-overlap] [--built-scorer]\n       node setup.mjs --root <dir> --resume [--tag <tag>]';
const SPEC = {
  root: 'string', goal: 'string', command: 'string', regex: 'string', direction: 'string', scope: 'string', readonly: 'string',
  limit: 'string', 'fast-check': 'string', scorer: 'string', tag: 'string', resume: 'boolean', 'no-overlap': 'boolean', 'built-scorer': 'boolean',
};
const RUNS = 3;

class SetupError extends Error {}

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (run.status !== 0) throw new SetupError(`git ${args.join(' ')} failed: ${(run.stderr || run.stdout).trim()}`);
  return run.stdout.trim();
}

const gitOk = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).status === 0;
const list = (text) => (text ?? '').split(',').map((item) => item.trim()).filter(Boolean);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function filesUnder(cwd, entry) {
  const full = path.join(cwd, entry);
  if (!fs.existsSync(full)) throw new SetupError(`read-only path missing: ${entry}`);
  if (!fs.statSync(full).isDirectory()) return [entry];
  return fs.readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => path.relative(cwd, path.join(item.parentPath, item.name)));
}

function hashPaths(cwd, entries) {
  const hashes = {};
  for (const file of entries.flatMap((entry) => filesUnder(cwd, entry))) hashes[file] = sha256(path.join(cwd, file));
  return hashes;
}

function readScore(output, regex) {
  const last = [...output.matchAll(new RegExp(regex, 'g'))].at(-1);
  const value = last === undefined ? NaN : Number(last[1] ?? last[0]);
  return Number.isFinite(value) ? value : null;
}

function scoreRuns(cwd, { command, regex }, count) {
  const runs = [];
  for (let index = 0; index < count; index += 1) {
    const started = Date.now();
    const run = runTreeSync(command, { cwd, timeoutMs: 3_600_000 });
    const score = readScore(run.output, regex);
    if (run.status !== 0 || score === null) throw new SetupError(`score command failed on run ${index + 1}: ${run.output.slice(-300)}`);
    runs.push({ score, seconds: (Date.now() - started) / 1000 });
  }
  return runs;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function sampleSd(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

// why: a scorer setup built must prove it notices damage, so one scope file is emptied in a throwaway worktree.
function probeSensitivity({ root, worktree, cfg, baseline }) {
  const probe = fs.mkdtempSync(path.join(path.dirname(path.resolve(root)), '.improve-probe-'));
  const dir = path.join(probe, 'tree');
  git(root, 'worktree', 'add', '--detach', dir, git(worktree, 'rev-parse', 'HEAD'));
  try {
    const target = git(dir, 'ls-files', '--', ...cfg.scope.map((glob) => `:(glob)${glob}`))?.split('\n').find(Boolean);
    if (!target) throw new SetupError('sensitivity probe found no tracked scope file to degrade');
    fs.writeFileSync(path.join(dir, target), '');
    const [{ score }] = scoreRuns(dir, cfg, 1);
    const worse = cfg.direction === 'higher' ? baseline - score : score - baseline;
    if (worse <= 2 * cfg.sd) throw new SetupError(`scorer rejected: emptying ${target} moved the score ${worse}, not more than 2*sd (${2 * cfg.sd})`);
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: root });
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

function modelFor() {
  return readKindTable().kinds['improve-round'] ?? { model: 'strong', effort: 'high' };
}

function defaultTag() {
  const now = new Date();
  return `${now.toLocaleString('en-US', { month: 'short' }).toLowerCase()}${now.getDate()}`;
}

// why: a taken tag gets -2, -3 instead of a question, since the user may be away.
function freeTag(root, wanted) {
  const taken = (tag) => gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/improve/${tag}`);
  let tag = wanted;
  for (let count = 2; taken(tag); count += 1) tag = `${wanted}-${count}`;
  return tag;
}

function settled(cfg, tag, score) {
  const fields = { tag, branch: `improve/${tag}`, worktree: cfg.worktree, next: cfg.next, score, sd: cfg.sd, limit: cfg.limit, model: cfg.model, effort: cfg.effort, 'no-overlap': Boolean(cfg.noOverlap) };
  process.stdout.write(`${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(' ')}\n`);
}

function commitScorer(root, worktree, paths) {
  if (paths.length === 0) return;
  for (const entry of paths) {
    if (!fs.existsSync(path.join(root, entry))) throw new SetupError(`scorer path missing: ${entry}`);
    fs.cpSync(path.join(root, entry), path.join(worktree, entry), { recursive: true });
  }
  git(worktree, 'add', '--', ...paths);
  if (!gitOk(worktree, 'diff', '--cached', '--quiet')) git(worktree, '-c', 'user.name=exo', '-c', 'user.email=exo@localhost', 'commit', '-m', 'chore(improve): add the frozen scorer');
}

// why: a failure after `worktree add` must not leave a branch or worktree, since each lead retry takes a new -2, -3 tag; a removal that fails is named, not hidden.
function discardBranches(root, pairs) {
  const left = [];
  for (const [tree, name] of pairs) {
    if (fs.existsSync(path.join(root, tree))) {
      const removed = spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: root, encoding: 'utf8' });
      if (removed.status !== 0) left.push(`worktree ${tree}: ${removed.stderr.trim()}`);
    }
    if (gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`)) {
      const dropped = spawnSync('git', ['branch', '-D', name], { cwd: root, encoding: 'utf8' });
      if (dropped.status !== 0) left.push(`branch ${name}: ${dropped.stderr.trim()}`);
    }
  }
  return left;
}

function checkEntries(flag, entries) {
  for (const entry of entries) {
    const rel = path.posix.normalize(entry);
    if (path.isAbsolute(entry) || rel === '..' || rel.startsWith('../')) throw new SetupError(`--${flag} entry must be relative and inside the repository: ${entry}`);
    try {
      matchScope(['probe'], [entry]);
    } catch (error) {
      if (!(error instanceof ScopeError)) throw error;
      throw new SetupError(`--${flag} entry is not a valid :(glob) pathspec: ${entry} (${error.message})`);
    }
  }
}

function fresh(flags) {
  const root = path.resolve(flags.root);
  checkEntries('scope', list(flags.scope));
  checkEntries('readonly', list(flags.readonly));
  checkEntries('scorer', list(flags.scorer));
  const tag = freeTag(root, flags.tag ?? defaultTag());
  const branch = `improve/${tag}`;
  const dir = path.join(root, '.exo', 'improve');
  excludeScratch(root);
  fs.mkdirSync(dir, { recursive: true });
  const worktree = `.worktrees/improve-${tag}`;
  const next = `${worktree}-next`;
  git(root, 'worktree', 'add', '-b', branch, worktree);
  const cwd = path.join(root, worktree);
  let cfg;
  let baseline;
  try {
    commitScorer(root, cwd, list(flags.scorer));
    git(root, 'worktree', 'add', '-b', `${branch}-next`, next, branch);
    const readOnly = [...new Set([...list(flags.readonly), ...list(flags.scorer)])];
    cfg = {
      goal: flags.goal, scope: list(flags.scope), readOnly, hashes: hashPaths(cwd, readOnly), command: flags.command, regex: flags.regex,
      direction: flags.direction, sd: 0, limit: 0, fastCheck: flags['fast-check'] ?? null, worktree, next,
      ...modelFor(), noOverlap: Boolean(flags['no-overlap']), builtScorer: Boolean(flags['built-scorer']),
    };
    const runs = scoreRuns(cwd, cfg, RUNS);
    const scores = runs.map((run) => run.score);
    const slowest = Math.max(...runs.map((run) => run.seconds));
    baseline = median(scores);
    cfg.sd = sampleSd(scores);
    cfg.limit = flags.limit ? Number(flags.limit) : Math.ceil(Math.max(1.5 * slowest, slowest + 60));
    if (cfg.builtScorer) probeSensitivity({ root, worktree: cwd, cfg, baseline });
    fs.writeFileSync(path.join(dir, `${tag}.json`), `${JSON.stringify(cfg, null, 2)}\n`);
    const commit = git(cwd, 'rev-parse', '--short', 'HEAD');
    fs.writeFileSync(path.join(dir, `${tag}.tsv`), `commit\tscore\tstatus\tdescription\n${commit}\t${baseline}\tkeep\tbaseline\n`);
  } catch (error) {
    const left = discardBranches(root, [[next, `${branch}-next`], [worktree, branch]]);
    if (left.length > 0) error.message += `\ncleanup left: ${left.join('; ')}`;
    throw error;
  }
  settled(cfg, tag, baseline);
}

function newestTag(dir, root) {
  const tags = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.tsv')).map((name) => name.slice(0, -4)) : [];
  const live = tags.filter((tag) => gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/improve/${tag}`));
  live.sort((a, b) => fs.statSync(path.join(dir, `${b}.tsv`)).mtimeMs - fs.statSync(path.join(dir, `${a}.tsv`)).mtimeMs);
  if (live.length === 0) throw new SetupError('no .exo/improve/*.tsv with an existing improve/<tag> branch to resume');
  return live[0];
}

function resume(flags) {
  const root = path.resolve(flags.root);
  const dir = path.join(root, '.exo', 'improve');
  const tag = flags.tag ?? newestTag(dir, root);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.json`), 'utf8'));
  const rows = fs.readFileSync(path.join(dir, `${tag}.tsv`), 'utf8').split('\n').slice(1).filter(Boolean).map((line) => line.split('\t'));
  const kept = rows.filter((row) => row[2] === 'keep').at(-1);
  if (!kept) throw new SetupError(`${tag}.tsv has no kept row`);
  for (const [tree, branch] of [[cfg.worktree, `improve/${tag}`], [cfg.next, `improve/${tag}-next`]]) {
    if (!fs.existsSync(path.join(root, tree))) git(root, 'worktree', 'add', tree, branch);
    git(path.join(root, tree), 'reset', '--hard', kept[0]);
  }
  settled(cfg, tag, Number(kept[1]));
}

function main() {
  try {
    const flags = parseFlags(process.argv.slice(2), SPEC, { usage: USAGE });
    const need = flags.resume ? ['root'] : ['root', 'goal', 'command', 'regex', 'direction', 'scope'];
    for (const name of need) if (!flags[name]) throw new UsageError(`--${name} is required`);
    if (!flags.resume && !['higher', 'lower'].includes(flags.direction)) throw new UsageError('--direction must be higher or lower');
    if (flags.resume) resume(flags);
    else fresh(flags);
  } catch (error) {
    if (!(error instanceof UsageError || error instanceof SetupError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) main();
