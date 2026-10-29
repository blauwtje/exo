#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readKindTable } from '../../../lib/model-kinds.mjs';
import { runTreeSync } from '../../../lib/process-tree.mjs';
import { excludeScratch } from '../../../lib/scratch-exclude.mjs';
import { isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';
import { filesUnder, lastKeep, readRows, readScore, scorerHash, writeBrief } from './round.mjs';
import { matchScope, ScopeError } from './scope.mjs';

const USAGE = 'usage: node setup.mjs --goal <text> --command <cmd> --regex <re> --direction higher|lower --scope <glob,...> [--root <dir>] [--readonly <path,...>] [--limit <s>] [--fast-check <cmd>] [--scorer <path,...>] [--tag <tag>]\n       node setup.mjs --resume [--root <dir>] [--tag <tag>]\nOutput: one line, tag= branch= worktree= score= limit= model= effort= brief=<path>. Exit 2 names the flag or step to fix.';
const SPEC = {
  root: 'string', goal: 'string', command: 'string', regex: 'string', direction: 'string', scope: 'string', readonly: 'string',
  limit: 'string', 'fast-check': 'string', scorer: 'string', tag: 'string', resume: 'boolean',
};
const BASELINE_TIMEOUT_MS = 3_600_000;
const LIMIT_FACTOR = 1.5;
const LIMIT_SLACK_S = 60;

class SetupError extends Error {}

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (run.status !== 0) throw new SetupError(`git ${args.join(' ')} failed: ${(run.stderr || run.stdout).trim()}`);
  return run.stdout.trim();
}

const gitOk = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).status === 0;
const list = (text) => (text ?? '').split(',').map((item) => item.trim()).filter(Boolean);

function baselineRun(cwd, { command, regex }) {
  const started = Date.now();
  const run = runTreeSync(command, { cwd, timeoutMs: BASELINE_TIMEOUT_MS });
  const score = readScore(run.output, regex);
  if (run.status !== 0 || score === null) throw new SetupError(`score command failed on the baseline run: ${run.output.slice(-300)}`);
  return { score, seconds: (Date.now() - started) / 1000 };
}

const deriveLimit = (seconds) => Math.ceil(Math.max(LIMIT_FACTOR * seconds, seconds + LIMIT_SLACK_S));

function checkReadOnly(cwd, entries) {
  for (const entry of entries) if (filesUnder(cwd, entry).length === 0) throw new SetupError(`read-only path missing or empty: ${entry}`);
}

function modelFor() {
  return readKindTable().kinds['improve-round'] ?? { model: 'strong', effort: 'high' };
}

function defaultTag() {
  const now = new Date();
  return `${now.toLocaleString('en-US', { month: 'short' }).toLowerCase()}${now.getDate()}`;
}

function freeTag(root, wanted) {
  const taken = (tag) => gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/improve/${tag}`);
  let tag = wanted;
  for (let count = 2; taken(tag); count += 1) tag = `${wanted}-${count}`;
  return tag;
}

function settled({ root, dir, cfg, tag, score }) {
  const brief = path.join(dir, `${tag}.brief.md`);
  const fields = { tag, branch: `improve/${tag}`, worktree: cfg.worktree, score, limit: cfg.limit, model: cfg.model, effort: cfg.effort, brief: path.resolve(root, brief) };
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

function discardBranch(root, worktree, branch) {
  const left = [];
  if (fs.existsSync(path.join(root, worktree))) {
    const removed = spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, encoding: 'utf8' });
    if (removed.status !== 0) left.push(`worktree ${worktree}: ${removed.stderr.trim()}`);
  }
  if (gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`)) {
    const dropped = spawnSync('git', ['branch', '-D', branch], { cwd: root, encoding: 'utf8' });
    if (dropped.status !== 0) left.push(`branch ${branch}: ${dropped.stderr.trim()}`);
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

function buildConfig(flags, cwd, worktree) {
  const readOnly = [...new Set([...list(flags.readonly), ...list(flags.scorer)])];
  checkReadOnly(cwd, readOnly);
  const cfg = {
    goal: flags.goal, scope: list(flags.scope), readOnly, scorerHash: scorerHash(cwd, readOnly), command: flags.command, regex: flags.regex,
    direction: flags.direction, limit: 0, fastCheck: flags['fast-check'] ?? null, worktree, ...modelFor(),
  };
  const baseline = baselineRun(cwd, cfg);
  cfg.limit = flags.limit ? Number(flags.limit) : deriveLimit(baseline.seconds);
  return { cfg, score: baseline.score };
}

function fresh(flags) {
  const root = path.resolve(flags.root ?? process.cwd());
  checkEntries('scope', list(flags.scope));
  checkEntries('readonly', list(flags.readonly));
  checkEntries('scorer', list(flags.scorer));
  const tag = freeTag(root, flags.tag ?? defaultTag());
  const branch = `improve/${tag}`;
  const dir = path.join(root, '.exo', 'improve');
  excludeScratch(root);
  fs.mkdirSync(dir, { recursive: true });
  const worktree = `.worktrees/improve-${tag}`;
  git(root, 'worktree', 'add', '-b', branch, worktree);
  const cwd = path.join(root, worktree);
  try {
    commitScorer(root, cwd, list(flags.scorer));
    const { cfg, score } = buildConfig(flags, cwd, worktree);
    fs.writeFileSync(path.join(dir, `${tag}.json`), `${JSON.stringify(cfg, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, `${tag}.tsv`), `commit\tscore\tstatus\tdescription\n${git(cwd, 'rev-parse', '--short', 'HEAD')}\t${score}\tkeep\tbaseline\n`);
    writeBrief({ dir, tag, cfg, rows: readRows(path.join(dir, `${tag}.tsv`)) });
    settled({ root, dir, cfg, tag, score });
  } catch (error) {
    const left = discardBranch(root, worktree, branch);
    if (left.length > 0) error.message += `\ncleanup left: ${left.join('; ')}`;
    throw error;
  }
}

function newestTag(dir, root) {
  const tags = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.tsv')).map((name) => name.slice(0, -4)) : [];
  const live = tags.filter((tag) => gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/improve/${tag}`));
  live.sort((a, b) => fs.statSync(path.join(dir, `${b}.tsv`)).mtimeMs - fs.statSync(path.join(dir, `${a}.tsv`)).mtimeMs);
  if (live.length === 0) throw new SetupError('no .exo/improve/*.tsv with an existing improve/<tag> branch to resume');
  return live[0];
}

function resume(flags) {
  const root = path.resolve(flags.root ?? process.cwd());
  const dir = path.join(root, '.exo', 'improve');
  const tag = flags.tag ?? newestTag(dir, root);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.json`), 'utf8'));
  const rows = readRows(path.join(dir, `${tag}.tsv`));
  const kept = lastKeep(rows);
  if (!kept) throw new SetupError(`${tag}.tsv has no kept row`);
  if (!fs.existsSync(path.join(root, cfg.worktree))) git(root, 'worktree', 'add', cfg.worktree, `improve/${tag}`);
  git(path.join(root, cfg.worktree), 'reset', '--hard', kept.commit);
  writeBrief({ dir, tag, cfg, rows });
  settled({ root, dir, cfg, tag, score: kept.score });
}

function main() {
  try {
    const flags = parseFlags(process.argv.slice(2), SPEC, { usage: USAGE });
    const need = flags.resume ? [] : ['goal', 'command', 'regex', 'direction', 'scope'];
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
