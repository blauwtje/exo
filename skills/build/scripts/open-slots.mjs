import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratchPath } from '#scratch-path';

const git = (directory, ...args) => spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });

const windowFile = (root) => scratchPath(root, 'window.json');

export const baselineFile = (root) => scratchPath(root, 'baseline.txt');

export const slotOf = (toplevel, number) => `${toplevel}-task-${number}`;

export function windowRecords(root) {
  try {
    return JSON.parse(fs.readFileSync(windowFile(root), 'utf8'));
  } catch {
    return {};
  }
}

export function restartRecord(root, number, record) {
  const records = { ...windowRecords(root), [number]: record };
  fs.writeFileSync(windowFile(root), JSON.stringify(records));
  return records;
}

// why: a gitignored plan input exists only in the run checkout, so each slot gets a copy.
function copyInputs(toplevel, slot, inputs) {
  for (const input of inputs) {
    const from = path.join(toplevel, input);
    if (!fs.statSync(from, { throwIfNoEntry: false })?.isFile() || path.basename(input).startsWith('.env')) continue;
    if (git(toplevel, 'check-ignore', '-q', '--', input).status !== 0) continue;
    fs.mkdirSync(path.dirname(path.join(slot, input)), { recursive: true });
    fs.copyFileSync(from, path.join(slot, input));
  }
}

function discard(toplevel, slots) {
  for (const slot of slots) {
    git(toplevel, 'worktree', 'remove', '--force', slot);
    fs.rmSync(slot, { recursive: true, force: true });
  }
  git(toplevel, 'worktree', 'prune');
}

function writeBaseline(toplevel, fresh) {
  fs.mkdirSync(path.dirname(baselineFile(toplevel)), { recursive: true });
  if (!fresh && fs.existsSync(baselineFile(toplevel))) return null;
  const status = git(toplevel, 'status', '--porcelain');
  if (status.status !== 0) return { reason: `git status failed: ${status.stderr.trim()}` };
  fs.writeFileSync(baselineFile(toplevel), status.stdout);
  return null;
}

function runSetup(slot, setup) {
  if (setup === null || setup === 'none') return null;
  const ran = spawnSync(setup, { cwd: slot, shell: true, encoding: 'utf8' });
  if (ran.status === 0) return null;
  return { reason: `Worktree setup failed in ${slot}: ${`${ran.stdout}${ran.stderr}`.trim().split('\n').at(-1)}` };
}

function openSlot(toplevel, number, { setup, inputs }, made) {
  const slot = slotOf(toplevel, number);
  const add = git(toplevel, 'worktree', 'add', '--detach', slot, 'HEAD');
  if (add.status !== 0) {
    return { reason: `git worktree add ${slot} failed: ${(add.stderr || add.stdout).trim().split('\n')[0]}` };
  }
  made.push(slot);
  fs.mkdirSync(path.join(slot, '.exo'), { recursive: true });
  copyInputs(toplevel, slot, inputs);
  return runSetup(slot, setup);
}

export function openSlots({ root, numbers, setup, inputs = [], fresh, since }) {
  const top = git(root, 'rev-parse', '--show-toplevel');
  if (top.status !== 0) return { reason: `${root} is no git checkout` };
  const toplevel = top.stdout.trim();
  const failed = writeBaseline(toplevel, fresh);
  if (failed) return failed;
  const head = git(toplevel, 'rev-parse', 'HEAD');
  if (head.status !== 0) return { reason: `git rev-parse HEAD failed: ${head.stderr.trim()}` };
  const base = head.stdout.trim();
  const made = [];
  for (const number of numbers) {
    const problem = openSlot(toplevel, number, { setup, inputs }, made);
    if (!problem) continue;
    discard(toplevel, made);
    return problem;
  }
  const records = fresh ? {} : windowRecords(toplevel);
  for (const number of numbers) records[number] = { slot: slotOf(toplevel, number), base, since };
  fs.writeFileSync(windowFile(toplevel), JSON.stringify(records));
  return { toplevel, base, baseline: baselineFile(toplevel), records };
}
