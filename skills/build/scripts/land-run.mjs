// Lands a run whose plan passed, or parks it in `<runDir>/gates.md`: checks the
// branch review, fetches and rebases onto origin, reruns the re-check when the
// rebase moved the branch, then lands per `Land:` (`local`, `push-main`, `pr`).
// It never forces: anything it would not do alone becomes an open gate, and an
// approved gate it named is acted on once at the next call.
//
// Usage: land-run.mjs --root <checkout> --run-root <build checkout> --branch <name>
//   --mode <local|push-main|pr> --run-dir <dir> [--success <text>] --started-at <ISO time>
// Prints one line; exit 0 landed, 3 parked, 2 bad argument.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch } from '#plan-tasks';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { openGate, readGates, takeApproved } from './run-state.mjs';

const REMOVE_WORKTREE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remove-worktree.mjs');
const LAND_ANYWAY = 'land anyway';

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: `${r.stderr ?? ''}${r.error?.message ?? ''}`.trim() };
}
const git = (cwd, ...args) => run(cwd, 'git', args);

/** The review gate's verdict: null when the review lets the run land, else why not. */
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
  return `branch review is ${verdict ?? 'unreadable'}${fix ? ` with fix=${fix}` : ''}`;
}

export function landRun({ root, runRoot, branch, mode, runDir, success = '', startedAt }) {
  const parked = (action, reason) => {
    openGate(runDir, { source: 'land', action, reason });
    return { phase: 'parked', gate: reason, range: null, pushed: null, prUrl: null, cleanup: null };
  };
  if (!branch) return parked('set Branch: in the plan', 'no branch');
  if (!['local', 'push-main', 'pr'].includes(mode)) return parked('set Land: in the plan', `unknown Land mode ${mode}`);
  const base = defaultBranch(root);
  if (!base) return parked('create a default branch', 'no default branch');
  const inPlace = path.resolve(runRoot) === path.resolve(root);
  const hasOrigin = git(root, 'remote', 'get-url', 'origin').ok;

  if (git(runRoot, 'status', '--porcelain', '--untracked-files=no').out) {
    return parked(`commit or discard the tracked changes in ${runRoot}`, 'worktree dirty');
  }
  if (!hasOrigin && mode !== 'local') return parked('add an origin remote', 'no origin remote');

  const problem = reviewProblem(runRoot, startedAt);
  if (problem && !takeApproved(runDir, LAND_ANYWAY)) return parked(LAND_ANYWAY, `review not clean: ${problem}`);

  if (hasOrigin) {
    const fetch = git(runRoot, 'fetch', 'origin');
    if (!fetch.ok) return parked('git fetch origin', `fetch failed: ${fetch.err.split('\n')[0]}`);
    const before = git(runRoot, 'rev-parse', 'HEAD').out;
    if (!git(runRoot, 'rebase', `origin/${base}`).ok) {
      git(runRoot, 'rebase', '--abort');
      return parked(`rebase ${branch} onto origin/${base} yourself in ${runRoot}`, 'rebase conflict');
    }
    const check = /`([^`]+)`/.exec(success)?.[1];
    const moved = git(runRoot, 'rev-parse', 'HEAD').out !== before;
    // A re-check that parked earlier is not waived by the next call finding the branch already rebased.
    const pending = readGates(runDir).some((g) => g.source === 'land' && g.status !== 'used' && g.reason.startsWith('re-check failed'));
    if (check && (moved || pending) && !run(runRoot, 'sh', ['-c', check]).ok
      && !takeApproved(runDir, LAND_ANYWAY)) {
      return parked(LAND_ANYWAY, `re-check failed after rebase: ${check}`);
    }
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

  // local and push-main: fast-forward the default branch onto the branch.
  const mainDirty = git(root, 'status', '--porcelain', '--untracked-files=no').out;
  if (!inPlace && (mainDirty || git(root, 'symbolic-ref', '-q', '--short', 'HEAD').out !== base)) {
    return parked(`clean ${root} and switch it to ${base}`, 'main checkout dirty or not on the default branch');
  }
  const old = git(root, 'rev-parse', base).out;
  if (inPlace && !git(root, 'switch', base).ok) return parked(`switch ${root} to ${base}`, `cannot switch to ${base}`);
  // An in-place park returns to the run branch, so the resumed call rebases it, not the default branch.
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
    root: 'value', 'run-root': 'value', branch: 'value', mode: 'value', 'run-dir': 'value', success: 'value', 'started-at': 'value',
  });
  for (const k of ['root', 'run-root', 'branch', 'mode', 'run-dir', 'started-at']) {
    if (f[k] === undefined) throw new UsageError(`flag '--${k}' is required`);
  }
  const r = landRun({
    root: f.root, runRoot: f['run-root'], branch: f.branch, mode: f.mode, runDir: f['run-dir'],
    success: f.success ?? '', startedAt: f['started-at'],
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
