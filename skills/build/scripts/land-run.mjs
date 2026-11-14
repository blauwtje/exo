import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cachedPass } from '#check-cache';
import { subjectProblem } from '#commit-text';
import { defaultBranch, gitText } from '#git';
import { isCovered, isPlanDoc } from '#plan-landed';
import { parsePlan } from '#plan-tasks';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { recordPush, recordRefDiff, snapshotRefs } from './run-ops.mjs';
import { openGate, readGates, takeApproved } from './run-state.mjs';

const REMOVE_WORKTREE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remove-worktree.mjs');
const NO_OVERRIDE = { reason: null, ignored: false };
const LAND_ANYWAY = 'land anyway';
const USAGE = [
  'usage: land-run.mjs --root <checkout> --run-root <build checkout> --branch <name>',
  '  --mode <local|push-main|pr> --run-dir <dir> [--success <text>]',
  '  [--commit <subject>]',
  'Prints one line; exit 0 landed, 3 parked, 2 bad argument.',
].join('\n');

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: `${r.stderr ?? ''}${r.error?.message ?? ''}`.trim() };
}
const git = (cwd, ...args) => run(cwd, 'git', args);

function passedOnTree(runRoot, check) {
  try {
    return cachedPass(runRoot, check) !== null;
  } catch {
    return false;
  }
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

function specCommitPlan(planPath, root) {
  const relative = path.relative(root, path.resolve(root, planPath));
  const added = gitText(root, ['log', '--diff-filter=A', '--format=%H', '--', relative]).split('\n').at(-1);
  if (!added) return null;
  return gitText(root, ['show', `${added}:${relative}`], { trim: false });
}

function committedPlan(planPath, root) {
  if (planPath === undefined) return null;
  try {
    return specCommitPlan(planPath, root);
  } catch {
    return null;
  }
}

function benchmarkOverride(plan, { root, planPath }) {
  if (plan.benchmarkOverride === null) return NO_OVERRIDE;
  const atSpec = committedPlan(planPath, root);
  const committed = atSpec === null ? null : parsePlan(atSpec).benchmarkOverride;
  if (committed === plan.benchmarkOverride) return { reason: committed, ignored: false };
  return { reason: null, ignored: true };
}

function overrideTrailer(root, runDir) {
  const stateFile = path.join(runDir, 'state.json');
  if (!fs.existsSync(stateFile)) return '';
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const planFile = path.resolve(root, state.plan);
  if (!fs.existsSync(planFile)) return '';
  const plan = parsePlan(fs.readFileSync(planFile, 'utf8'));
  const { reason } = benchmarkOverride(plan, { root, planPath: state.plan });
  return reason === null ? '' : `Benchmark-override: ${reason}`;
}

function squashRun({ runRoot, target, commit, override }) {
  const range = `${target}..HEAD`;
  const subjects = git(runRoot, 'log', '--reverse', '--format=%s', range).out.split('\n').filter(Boolean);
  if (subjects.length === 0 || (subjects.length === 1 && subjects[0] === commit)) return null;
  const trailers = git(runRoot, 'log', '--reverse', '--format=%B', range).out
    .split('\n').filter((line) => line.startsWith('Plan-task:'));
  const list = subjects.map((subject) => `- ${subject}`).join('\n');
  const body = [list, [...trailers, override].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
  if (!git(runRoot, 'reset', '--soft', target).ok) return 'soft reset failed';
  const made = git(runRoot, 'commit', '-q', '-m', commit, '-m', body);
  return made.ok ? null : `squash commit failed: ${made.err.split('\n')[0]}`;
}

export function landRun(args) {
  const ledger = { root: args.root, id: path.basename(args.runDir), label: 'land' };
  const before = snapshotRefs(args.root);
  try {
    return landSteps(args, ledger);
  } finally {
    recordRefDiff(ledger, before);
  }
}

const problem = (action, reason) => ({ action, reason });
const shortSha = (sha) => sha.slice(0, 7);
const landedResult = (extra) => ({ phase: 'landed', gate: null, range: null, pushed: null, prUrl: null, cleanup: null, ...extra });

function parkedResult(runDir, { action, reason }) {
  openGate(runDir, { source: 'land', action, reason });
  return { phase: 'parked', gate: reason, range: null, pushed: null, prUrl: null, cleanup: null };
}

function planProblem({ branch, mode, commit }) {
  if (!branch) return problem('set Branch: in the plan', 'no branch');
  if (!['local', 'push-main', 'pr'].includes(mode)) return problem('set Land: in the plan', `unknown Land mode ${mode}`);
  if (mode === 'pr') return null;
  if (!commit) return problem('set Commit: in the plan', 'no Commit: line');
  if (subjectProblem(commit)) return problem('set Commit: in the plan', 'bad Commit: line');
  return null;
}

function checkoutProblem({ root, runRoot, runDir, mode }, hasOrigin) {
  const docsProblem = commitPlanDocs(root, runRoot, runDir);
  if (docsProblem) return problem(`restore the plan named in ${path.join(runDir, 'state.json')}`, docsProblem);
  if (git(runRoot, 'status', '--porcelain', '--untracked-files=no').out) {
    return problem(`commit or discard the tracked changes in ${runRoot}`, 'worktree dirty');
  }
  if (!hasOrigin && mode !== 'local') return problem('add an origin remote', 'no origin remote');
  return null;
}

function localIsAhead(root, base) {
  return git(root, 'merge-base', '--is-ancestor', `origin/${base}`, base).ok
    && git(root, 'rev-parse', base).out !== git(root, 'rev-parse', `origin/${base}`).out;
}

function rebaseOntoBase({ root, runRoot, branch, base }, hasOrigin) {
  let target = base;
  if (hasOrigin) {
    const fetch = git(runRoot, 'fetch', 'origin');
    if (!fetch.ok) return { problem: problem('git fetch origin', `fetch failed: ${fetch.err.split('\n')[0]}`) };
    if (!localIsAhead(root, base)) target = `origin/${base}`;
  }
  const before = git(runRoot, 'rev-parse', 'HEAD').out;
  if (!git(runRoot, 'rebase', target).ok) {
    git(runRoot, 'rebase', '--abort');
    return { problem: problem(`rebase ${branch} onto ${target} yourself in ${runRoot}`, 'rebase conflict') };
  }
  return { target, moved: git(runRoot, 'rev-parse', 'HEAD').out !== before };
}

function recheckProblem({ runRoot, runDir }, success, moved) {
  const check = /`([^`]+)`/.exec(success)?.[1]?.replace(/^mcp:.*/s, '');
  const pending = readGates(runDir).some((g) => g.source === 'land' && g.status !== 'used' && g.reason.startsWith('re-check failed'));
  if (check && (moved || pending || !passedOnTree(runRoot, check)) && !run(runRoot, 'sh', ['-c', check]).ok
    && !takeApproved(runDir, LAND_ANYWAY)) {
    return problem(LAND_ANYWAY, `re-check failed after rebase: ${check}`);
  }
  return null;
}

function removeKeptWorktree({ root, runRoot }) {
  const rm = run(root, process.execPath, [REMOVE_WORKTREE, '--kept', '--worktree', runRoot, '--run', root]);
  return { ok: rm.ok, note: rm.ok ? 'worktree removed' : `worktree kept: ${(rm.err || rm.out).split('\n')[0]}` };
}

function openPullRequest(land, head) {
  const { root, runRoot, branch, runDir, base, inPlace, ledger } = land;
  const park = (action, reason) => parkedResult(runDir, problem(action, reason));
  const forceAction = `git push --force-with-lease origin ${branch}`;
  const forced = takeApproved(runDir, forceAction);
  const push = git(runRoot, 'push', '-u', ...(forced ? ['--force-with-lease'] : []), 'origin', branch);
  if (!push.ok) {
    const diverged = /rejected|non-fast-forward|fetch first/.test(push.err);
    return park(diverged ? forceAction : `git push -u origin ${branch}`, `push of ${branch} failed${diverged ? ': remote branch diverged' : ''}`);
  }
  recordPush(ledger, { remote: 'origin', ref: branch, sha: head });
  const ghArgs = ['pr', 'create', '--base', base, '--head', branch, '--fill'];
  const gh = run(runRoot, 'gh', ghArgs);
  if (!gh.ok) return park(`gh ${ghArgs.join(' ')}`, `gh failed: ${gh.err.split('\n')[0]}`);
  const range = `${shortSha(git(root, 'rev-parse', `origin/${base}`).out)}..${shortSha(head)}`;
  const notes = inPlace ? [] : [removeKeptWorktree(land).note];
  return landedResult({ range, pushed: `origin/${branch}`, prUrl: gh.out.split('\n').pop(), cleanup: [...notes, 'branch kept'].join('; ') });
}

function mergeLocally(land) {
  const { root, runRoot, branch, mode, runDir, base, inPlace, ledger } = land;
  const park = (action, reason) => parkedResult(runDir, problem(action, reason));
  const mainDirty = git(root, 'status', '--porcelain', '--untracked-files=no').out;
  if (!inPlace && (mainDirty || git(root, 'symbolic-ref', '-q', '--short', 'HEAD').out !== base)) {
    return park(`clean ${root} and switch it to ${base}`, 'main checkout dirty or not on the default branch');
  }
  const old = git(root, 'rev-parse', base).out;
  if (inPlace && !git(root, 'switch', base).ok) return park(`switch ${root} to ${base}`, `cannot switch to ${base}`);
  const parkOnBranch = (action, reason) => {
    if (inPlace) git(root, 'switch', branch);
    return park(action, reason);
  };
  if (!git(root, 'merge', '--ff-only', branch).ok) {
    return parkOnBranch(`rebase ${branch} onto ${base} yourself in ${runRoot}`, `${base} cannot fast-forward to ${branch}`);
  }
  const range = `${shortSha(old)}..${shortSha(git(root, 'rev-parse', base).out)}`;
  let pushed = null;
  if (mode === 'push-main') {
    const push = git(root, 'push', 'origin', base);
    if (!push.ok) return parkOnBranch(`fetch origin and rebase ${base} yourself in ${root}`, `push of ${base} failed: ${push.err.split('\n')[0]}`);
    recordPush(ledger, { remote: 'origin', ref: base, sha: git(root, 'rev-parse', base).out });
    pushed = `origin/${base}`;
  }
  const notes = [];
  if (!inPlace) {
    const removed = removeKeptWorktree(land);
    notes.push(removed.note);
    if (!removed.ok) return landedResult({ range, pushed, cleanup: `${notes.join('; ')}; branch kept` });
  }
  const del = git(root, 'branch', '-d', branch);
  notes.push(del.ok ? 'branch deleted' : `branch kept: ${del.err.split('\n')[0]}`);
  return landedResult({ range, pushed, cleanup: notes.join('; ') });
}

function landSteps(args, ledger) {
  const { root, runRoot, branch, mode, runDir, success = '', commit = '' } = args;
  const early = planProblem({ branch, mode, commit });
  if (early) return parkedResult(runDir, early);
  const base = defaultBranch(root);
  if (!base) return parkedResult(runDir, problem('create a default branch', 'no default branch'));
  const land = { root, runRoot, branch, mode, runDir, base, inPlace: path.resolve(runRoot) === path.resolve(root), ledger };
  const hasOrigin = git(root, 'remote', 'get-url', 'origin').ok;
  const unready = checkoutProblem(land, hasOrigin);
  if (unready) return parkedResult(runDir, unready);
  const rebased = rebaseOntoBase(land, hasOrigin);
  if (rebased.problem) return parkedResult(runDir, rebased.problem);
  const stale = recheckProblem(land, success, rebased.moved);
  if (stale) return parkedResult(runDir, stale);
  if (mode !== 'pr') {
    const squashed = squashRun({ runRoot, target: rebased.target, commit, override: overrideTrailer(root, runDir) });
    if (squashed) return parkedResult(runDir, problem(`squash ${branch} onto ${rebased.target} yourself in ${runRoot}`, squashed));
  }
  if (mode === 'pr') return openPullRequest(land, git(runRoot, 'rev-parse', 'HEAD').out);
  return mergeLocally(land);
}

function main(argv) {
  const f = parseFlags(argv, {
    root: 'value', 'run-root': 'value', branch: 'value', mode: 'value', 'run-dir': 'value', success: 'value', commit: 'value',
  }, { usage: USAGE });
  for (const k of ['root', 'run-root', 'branch', 'mode', 'run-dir']) {
    if (f[k] === undefined) throw new UsageError(`flag '--${k}' is required`);
  }
  const r = landRun({
    root: f.root, runRoot: f['run-root'], branch: f.branch, mode: f.mode, runDir: f['run-dir'],
    success: f.success ?? '', commit: f.commit ?? '',
  });
  const detail = r.phase === 'landed'
    ? [r.range, r.pushed && `pushed ${r.pushed}`, r.prUrl, r.cleanup].filter(Boolean).join(' | ')
    : `gate: ${r.gate}`;
  process.stdout.write(`land-run: ${r.phase}${detail ? ` | ${detail}` : ''}\n`);
  process.exitCode = r.phase === 'landed' ? 0 : 3;
}

function runMain(argv) {
  try {
    main(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (isMain(import.meta.url)) runMain(process.argv.slice(2));
