import process from 'node:process';
import { spawn } from 'node:child_process';
import { defaultBranch, gitLine } from '#git';
import { CLI, RUN_PLAN } from './cli-paths.mjs';
import { cleanUp, updateDefault } from './run-chores.mjs';
import { isPluginCheckout, putOnBranch, refuseLoadedCheckout, worktreeFor } from './run-checkout.mjs';
import { planFrame } from './plan-file.mjs';
import { runDir } from './run-state.mjs';

export async function buildRun(root, plan, flags, id) {
  const { branch, land } = planFrame(plan);
  const base = defaultBranch(root);
  const chores = base !== null && !flags.some((flag) => flag === '--dry-run' || flag === '--help');
  const missing = branch !== null && gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`]) === null;
  if (chores) updateDefault(root, base, missing);
  const inTree = branch !== null && isPluginCheckout(root);
  let runRoot = root;
  if (inTree) runRoot = worktreeFor(root, branch);
  else {
    refuseLoadedCheckout(root, CLI);
    if (branch !== null) putOnBranch(root, branch);
  }
  if (chores) cleanUp(root, base, [branch, gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD'])]);

  const rootFlags = inTree ? ['--root', runRoot] : [];
  const env = { ...process.env, EXO_RUN: id, EXO_RUN_DIR: runDir(root, id) };
  const child = spawn(process.execPath, [RUN_PLAN, plan, ...rootFlags, ...flags], { cwd: runRoot, stdio: ['inherit', 'pipe', 'pipe'], env });
  // why: run-plan's lines pass through process.stdout.write and process.stderr.write, so teeToFile copies them to live.log.
  let outTail = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  // why: a signal to this process does not reach run-plan unless it is forwarded, so run-plan can end its claude group.
  const forward = (signal) => child.kill(signal);
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  for (const signal of signals) process.on(signal, forward);
  const done = await new Promise((resolve) => {
    child.on('error', () => resolve({ status: null }));
    child.on('close', (status) => resolve({ status }));
  });
  for (const signal of signals) process.off(signal, forward);
  const preview = flags.some((flag) => flag === '--dry-run' || flag === '--help');
  // why: run-plan writes preflight refusals to stdout as `run-plan: refused: <message>` and usage errors to stderr as `run-plan: <message>`; other children write `exo: <message>`.
  const reasonLine = outTail.split('\n').filter((line) => /^(exo|run-plan): /.test(line)).pop();
  const reason = reasonLine === undefined ? null : reasonLine.replace(/^(exo|run-plan): (refused: )?/, '');
  return { code: done.status ?? null, runRoot, branch, land: preview ? null : land, reason };
}
