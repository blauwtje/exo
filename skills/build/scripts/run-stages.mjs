import process from 'node:process';
import { spawn } from 'node:child_process';
import { defaultBranch, gitLine, gitResult } from '#git';
import { CLI, RUN_PLAN } from './cli-paths.mjs';
import { readState, runDir } from './run-state.mjs';
import { Refusal } from './cli-refusal.mjs';
import { planFrame } from './plan-file.mjs';
import { isPluginCheckout, putOnBranch, refuseLoadedCheckout, worktreeFor, worktrees } from './run-checkout.mjs';
import { recordRefDiff, recordWorktree, snapshotRefs } from './run-ops.mjs';
import { landRun } from './land-run.mjs';

export const isPreview = (flags) => flags.some((flag) => flag === '--dry-run' || flag === '--help');

export async function buildRun({ root, plan, flags, id }) {
  const before = snapshotRefs(root);
  try {
    return await buildRunSteps({ root, plan, flags, id });
  } finally {
    if (!isPreview(flags)) recordRefDiff({ root, id, label: 'build' }, before);
  }
}

function checkoutRunRoot({ root, branch, id }) {
  const inTree = branch !== null && isPluginCheckout(root);
  if (inTree) {
    const runRoot = worktreeFor(root, branch);
    if (runRoot !== root) recordWorktree({ root, id, label: 'build' }, runRoot, branch);
    return { runRoot, inTree };
  }
  refuseLoadedCheckout(root, CLI);
  if (branch !== null) putOnBranch(root, branch);
  return { runRoot: root, inTree };
}

async function runPlanChild({ root, plan, flags, id }, { runRoot, inTree }) {
  const rootFlags = inTree ? ['--root', runRoot] : [];
  const env = { ...process.env, EXO_RUN: id, EXO_RUN_DIR: runDir(root, id) };
  const child = spawn(process.execPath, [RUN_PLAN, plan, ...rootFlags, ...flags], { cwd: runRoot, stdio: ['inherit', 'pipe', 'pipe'], env });
  let outTail = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  const forward = (signal) => child.kill(signal);
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  for (const signal of signals) process.on(signal, forward);
  const done = await new Promise((resolve) => {
    child.on('error', () => resolve({ status: null }));
    child.on('close', (status) => resolve({ status }));
  });
  for (const signal of signals) process.off(signal, forward);
  return { status: done.status ?? null, outTail };
}

function stopReason(outTail) {
  const reasonLine = outTail.split('\n').filter((line) => /^(exo|run-plan): /.test(line)).pop();
  return reasonLine === undefined ? null : reasonLine.replace(/^(exo|run-plan): (refused: )?/, '');
}

async function buildRunSteps(run) {
  const { root, plan, flags, id } = run;
  const { branch, land } = planFrame(plan);
  const base = defaultBranch(root);
  const chores = base !== null && !isPreview(flags);
  const missing = branch !== null && gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`]) === null;
  if (chores) updateDefault(root, base, missing);
  const checkout = checkoutRunRoot({ root, branch, id });
  if (chores) cleanUp(root, base, [branch, gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD'])]);
  const { status, outTail } = await runPlanChild(run, checkout);
  return { code: status, runRoot: checkout.runRoot, branch, land: isPreview(flags) ? null : land, reason: stopReason(outTail) };
}

function updateDefault(root, base, needed) {
  if (gitResult(root, ['remote']).text === '') return;
  if (!gitResult(root, ['fetch', '--prune']).ok) {
    process.stdout.write('exo: git fetch failed; going on with the local default branch\n');
    return;
  }
  const upstream = gitResult(root, ['rev-parse', '-q', '--verify', `refs/remotes/origin/${base}`]).text;
  const local = gitResult(root, ['rev-parse', '-q', '--verify', `refs/heads/${base}`]).text;
  if (upstream === '' || local === '' || upstream === local) return;
  if (gitResult(root, ['merge-base', '--is-ancestor', upstream, local]).ok) return;
  if (!gitResult(root, ['merge-base', '--is-ancestor', local, upstream]).ok) {
    if (!needed) {
      process.stdout.write(`exo: warning: ${base} and origin/${base} have diverged; going on with the existing plan branch\n`);
      return;
    }
    throw new Refusal(`refused: ${base} and origin/${base} have diverged; rebase or reset ${base} onto origin/${base} yourself, then rerun exo run`);
  }
  const holder = worktrees(root).find((tree) => tree.branch === base);
  const moved = holder === undefined
    ? gitResult(root, ['update-ref', '-m', 'exo: fast-forward', `refs/heads/${base}`, upstream, local])
    : gitResult(holder.path, ['merge', '--ff-only', upstream]);
  if (!moved.ok) throw new Refusal(`refused: could not fast-forward ${base} to origin/${base}: ${moved.error}`);
  process.stdout.write(`exo: fast-forwarded ${base} to origin/${base}\n`);
}

function cleanUp(root, base, keep) {
  gitResult(root, ['worktree', 'prune']);
  const merged = gitResult(root, ['branch', '--merged', base, '--format=%(refname:short)']).text.split('\n').filter(Boolean);
  const gone = gitResult(root, ['for-each-ref', '--format=%(refname:short)\t%(upstream:track)', 'refs/heads']).text
    .split('\n').filter((line) => line.endsWith('\t[gone]')).map((line) => line.split('\t')[0]);
  const checkedOut = worktrees(root).map((tree) => tree.branch);
  for (const name of merged) {
    if (name === base || keep.includes(name) || !gone.includes(name) || checkedOut.includes(name)) continue;
    const deleted = gitResult(root, ['branch', '-d', name]);
    process.stdout.write(deleted.ok ? `exo: removed branch ${name}\n` : `exo: kept branch ${name}: ${deleted.error}\n`);
  }
}

export function landStage(root, id, plan) {
  const state = readState(root, id);
  const frame = planFrame(plan);
  const result = landRun({
    root, runRoot: state.runRoot ?? root, branch: state.branch ?? frame.branch, mode: frame.land, commit: frame.commit ?? '', runDir: runDir(root, id),
    success: frame.successCriterion ?? ''
  });
  process.stdout.write(`exo: ${result.phase === 'landed' ? `landed ${result.range ?? ''} ${result.prUrl ?? ''}`.trim() : `parked: ${result.gate}; exo approve ${id}`}\n`);
  return result;
}
