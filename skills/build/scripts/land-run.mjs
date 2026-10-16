import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cachedPass } from '#check-cache';
import { subjectProblem } from '#commit-text';
import { defaultBranch, isCovered, isPlanDoc, parsePlan } from '#plan-tasks';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { openGate, readGates, takeApproved } from './run-state.mjs';

const REMOVE_WORKTREE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remove-worktree.mjs');
const LAND_ANYWAY = 'land anyway';
const USAGE = [
  'usage: land-run.mjs --root <checkout> --run-root <build checkout> --branch <name>',
  '  --mode <local|push-main|pr> --run-dir <dir> [--success <text>]',
  '  [--commit <subject>] --started-at <ISO time>',
  'Prints one line; exit 0 landed, 3 parked, 2 bad argument.',
].join('\n');

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: `${r.stderr ?? ''}${r.error?.message ?? ''}`.trim() };
}
const git = (cwd, ...args) => run(cwd, 'git', args);

// why: a branch rebased by hand moves nothing in this rebase, so only the cache's tree key shows the criterion never ran on it.
function passedOnTree(runRoot, check) {
  try {
    return cachedPass(runRoot, check) !== null;
  } catch {
    return false;
  }
}

function fixLanded(runRoot, branchMtime) {
  const file = path.join(runRoot, '.exo', 'fix-review.md');
  let text;
  try {
    if (fs.statSync(file).mtimeMs < branchMtime) return false;
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const verdict = /\b(CLEAN|FINDINGS|BLOCKED)\b/.exec(text)?.[1];
  return verdict === 'CLEAN' || (verdict === 'FINDINGS' && !/;\s*fix\s*$/m.test(text));
}

function reviewProblem(runRoot, startedAt) {
  const file = path.join(runRoot, '.exo', 'branch-review.md');
  let text;
  let mtime;
  try {
    text = fs.readFileSync(file, 'utf8');
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return 'no branch review';
  }
  if (!(mtime >= Date.parse(startedAt))) return 'branch review is older than the run';
  const verdict = /^\s*(CLEAN|FINDINGS|BLOCKED)\b/.exec(text.split('\n')[0])?.[1];
  if (verdict === 'CLEAN') return null;
  const fix = [...text.matchAll(/^Count:.*\bfix=(\d+)/gm)].at(-1)?.[1];
  if (verdict === 'FINDINGS' && fix === '0') return null;
  if (verdict === 'FINDINGS' && fixLanded(runRoot, mtime)) return null;
  return `branch review is ${verdict ?? 'unreadable'}${fix ? ` with fix=${fix}` : ''}`;
}

function plannedPaths(root, runDir) {
  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8'));
  const { tasks } = parsePlan(fs.readFileSync(path.resolve(root, state.plan), 'utf8'));
  return tasks.flatMap((task) => task.files.map((file) => file.path));
}

function commitPlanDocs(root, runRoot, runDir) {
  const status = git(runRoot, 'status', '--porcelain', '-z', '--untracked-files=all').out;
  const candidates = status.split('\0').filter(Boolean).map((entry) => entry.slice(3)).filter(isPlanDoc);
  if (candidates.length === 0) return null;
  let planned;
  try {
    planned = plannedPaths(root, runDir);
  } catch (error) {
    return `cannot read plan for plan docs: ${error.message}`;
  }
  const docs = candidates.filter((file) => !isCovered(planned, file));
  if (docs.length === 0) return null;
  if (git(runRoot, 'add', '--', ...docs).ok) git(runRoot, 'commit', '-q', '-m', 'docs: add plan documents', '--', ...docs);
  return null;
}

function squashRun(runRoot, target, commit) {
  const range = `${target}..HEAD`;
  const subjects = git(runRoot, 'log', '--reverse', '--format=%s', range).out.split('\n').filter(Boolean);
  if (subjects.length === 0 || (subjects.length === 1 && subjects[0] === commit)) return null;
  const trailers = git(runRoot, 'log', '--reverse', '--format=%B', range).out
    .split('\n').filter((line) => line.startsWith('Plan-task:'));
  const body = [subjects.map((subject) => `- ${subject}`).join('\n'), trailers.join('\n')].filter(Boolean).join('\n\n');
  if (!git(runRoot, 'reset', '--soft', target).ok) return 'soft reset failed';
  const made = git(runRoot, 'commit', '-q', '-m', commit, '-m', body);
  return made.ok ? null : `squash commit failed: ${made.err.split('\n')[0]}`;
}

export function landRun({ root, runRoot, branch, mode, runDir, success = '', commit = '', startedAt }) {
  const parked = (action, reason) => {
    openGate(runDir, { source: 'land', action, reason });
    return { phase: 'parked', gate: reason, range: null, pushed: null, prUrl: null, cleanup: null };
  };
  if (!branch) return parked('set Branch: in the plan', 'no branch');
  if (!['local', 'push-main', 'pr'].includes(mode)) return parked('set Land: in the plan', `unknown Land mode ${mode}`);
  if (mode !== 'pr') {
    if (!commit) return parked('set Commit: in the plan', 'no Commit: line');
    if (subjectProblem(commit)) return parked('set Commit: in the plan', 'bad Commit: line');
  }
  const base = defaultBranch(root);
  if (!base) return parked('create a default branch', 'no default branch');
  const inPlace = path.resolve(runRoot) === path.resolve(root);
  const hasOrigin = git(root, 'remote', 'get-url', 'origin').ok;

  const docsProblem = commitPlanDocs(root, runRoot, runDir);
  if (docsProblem) return parked(`restore the plan named in ${path.join(runDir, 'state.json')}`, docsProblem);
  if (git(runRoot, 'status', '--porcelain', '--untracked-files=no').out) {
    return parked(`commit or discard the tracked changes in ${runRoot}`, 'worktree dirty');
  }
  if (!hasOrigin && mode !== 'local') return parked('add an origin remote', 'no origin remote');

  const problem = reviewProblem(runRoot, startedAt);
  if (problem && !takeApproved(runDir, LAND_ANYWAY)) return parked(LAND_ANYWAY, `review not clean: ${problem}`);

  let target = base;
  {
    if (hasOrigin) {
      const fetch = git(runRoot, 'fetch', 'origin');
      if (!fetch.ok) return parked('git fetch origin', `fetch failed: ${fetch.err.split('\n')[0]}`);
      const localAhead = git(root, 'merge-base', '--is-ancestor', `origin/${base}`, base).ok
        && git(root, 'rev-parse', base).out !== git(root, 'rev-parse', `origin/${base}`).out;
      if (!localAhead) target = `origin/${base}`;
    }
    const before = git(runRoot, 'rev-parse', 'HEAD').out;
    if (!git(runRoot, 'rebase', target).ok) {
      git(runRoot, 'rebase', '--abort');
      return parked(`rebase ${branch} onto ${target} yourself in ${runRoot}`, 'rebase conflict');
    }
    const check = /`([^`]+)`/.exec(success)?.[1]?.replace(/^mcp:.*/s, '');
    const moved = git(runRoot, 'rev-parse', 'HEAD').out !== before;
    const pending = readGates(runDir).some((g) => g.source === 'land' && g.status !== 'used' && g.reason.startsWith('re-check failed'));
    if (check && (moved || pending || !passedOnTree(runRoot, check)) && !run(runRoot, 'sh', ['-c', check]).ok
      && !takeApproved(runDir, LAND_ANYWAY)) {
      return parked(LAND_ANYWAY, `re-check failed after rebase: ${check}`);
    }
  }

  if (mode !== 'pr') {
    const squashed = squashRun(runRoot, target, commit);
    if (squashed) return parked(`squash ${branch} onto ${target} yourself in ${runRoot}`, squashed);
  }

  const head = git(runRoot, 'rev-parse', 'HEAD').out;
  const short = (sha) => sha.slice(0, 7);
  const landed = (extra) => ({ phase: 'landed', gate: null, range: null, pushed: null, prUrl: null, cleanup: null, ...extra });

  if (mode === 'pr') {
    const forceAction = `git push --force-with-lease origin ${branch}`;
    const forced = takeApproved(runDir, forceAction);
    const push = git(runRoot, 'push', '-u', ...(forced ? ['--force-with-lease'] : []), 'origin', branch);
    if (!push.ok) {
      const diverged = /rejected|non-fast-forward|fetch first/.test(push.err);
      return parked(diverged ? forceAction : `git push -u origin ${branch}`, `push of ${branch} failed${diverged ? ': remote branch diverged' : ''}`);
    }
    const ghArgs = ['pr', 'create', '--base', base, '--head', branch, '--fill'];
    const gh = run(runRoot, 'gh', ghArgs);
    if (!gh.ok) return parked(`gh ${ghArgs.join(' ')}`, `gh failed: ${gh.err.split('\n')[0]}`);
    const range = `${short(git(root, 'rev-parse', `origin/${base}`).out)}..${short(head)}`;
    const notes = [];
    if (!inPlace) {
      const rm = run(root, process.execPath, [REMOVE_WORKTREE, '--kept', '--worktree', runRoot, '--run', root]);
      notes.push(rm.ok ? 'worktree removed' : `worktree kept: ${(rm.err || rm.out).split('\n')[0]}`);
    }
    return landed({ range, pushed: `origin/${branch}`, prUrl: gh.out.split('\n').pop(), cleanup: [...notes, 'branch kept'].join('; ') });
  }

  const mainDirty = git(root, 'status', '--porcelain', '--untracked-files=no').out;
  if (!inPlace && (mainDirty || git(root, 'symbolic-ref', '-q', '--short', 'HEAD').out !== base)) {
    return parked(`clean ${root} and switch it to ${base}`, 'main checkout dirty or not on the default branch');
  }
  const old = git(root, 'rev-parse', base).out;
  if (inPlace && !git(root, 'switch', base).ok) return parked(`switch ${root} to ${base}`, `cannot switch to ${base}`);
  const parkedOnBranch = (action, reason) => {
    if (inPlace) git(root, 'switch', branch);
    return parked(action, reason);
  };
  if (!git(root, 'merge', '--ff-only', branch).ok) {
    return parkedOnBranch(`rebase ${branch} onto ${base} yourself in ${runRoot}`, `${base} cannot fast-forward to ${branch}`);
  }
  const range = `${short(old)}..${short(git(root, 'rev-parse', base).out)}`;
  let pushed = null;
  if (mode === 'push-main') {
    const push = git(root, 'push', 'origin', base);
    if (!push.ok) return parkedOnBranch(`fetch origin and rebase ${base} yourself in ${root}`, `push of ${base} failed: ${push.err.split('\n')[0]}`);
    pushed = `origin/${base}`;
  }
  const notes = [];
  if (!inPlace) {
    const rm = run(root, process.execPath, [REMOVE_WORKTREE, '--kept', '--worktree', runRoot, '--run', root]);
    notes.push(rm.ok ? 'worktree removed' : `worktree kept: ${(rm.err || rm.out).split('\n')[0]}`);
    if (!rm.ok) return landed({ range, pushed, cleanup: `${notes.join('; ')}; branch kept` });
  }
  const del = git(root, 'branch', '-d', branch);
  notes.push(del.ok ? 'branch deleted' : `branch kept: ${del.err.split('\n')[0]}`);
  return landed({ range, pushed, cleanup: notes.join('; ') });
}

function main(argv) {
  const f = parseFlags(argv, {
    root: 'value', 'run-root': 'value', branch: 'value', mode: 'value', 'run-dir': 'value', success: 'value', commit: 'value', 'started-at': 'value',
  }, { usage: USAGE });
  for (const k of ['root', 'run-root', 'branch', 'mode', 'run-dir', 'started-at']) {
    if (f[k] === undefined) throw new UsageError(`flag '--${k}' is required`);
  }
  const r = landRun({
    root: f.root, runRoot: f['run-root'], branch: f.branch, mode: f.mode, runDir: f['run-dir'],
    success: f.success ?? '', commit: f.commit ?? '', startedAt: f['started-at'],
  });
  const detail = r.phase === 'landed'
    ? [r.range, r.pushed && `pushed ${r.pushed}`, r.prUrl, r.cleanup].filter(Boolean).join(' | ')
    : `gate: ${r.gate}`;
  process.stdout.write(`land-run: ${r.phase}${detail ? ` | ${detail}` : ''}\n`);
  process.exitCode = r.phase === 'landed' ? 0 : 3;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
