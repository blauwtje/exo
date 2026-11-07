import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readJsonOrNull } from '#basics';
import { createWorktree } from '#checkout';
import { scratchPath } from '#scratch-path';
import { git } from '#git';

const windowFile = (root) => scratchPath(root, 'window.json');

export const baselineFile = (root) => scratchPath(root, 'baseline.txt');

export const slotOf = (toplevel, number) => `${toplevel}-task-${number}`;

const PORT_STRIDE = 10;

const DEFAULT_PORT_START = 42000;

export function slotEnv(toplevel, index, env = process.env) {
  const start = Number.parseInt(env.EXO_SLOT_PORT_START ?? '', 10);
  const portBase = (Number.isInteger(start) && start > 0 ? start : DEFAULT_PORT_START) + index * PORT_STRIDE;
  return { EXO_SLOT: String(index), EXO_PORT_BASE: String(portBase), EXO_STATE_DIR: path.join(toplevel, '.exo', 'slot-state', String(index)) };
}

const envLine = (variables) => Object.entries(variables).map(([name, value]) => `${name}=${value}`).join(' ');

export const slotEnvLine = (record) => envLine(record.env ?? {});

function freeIndexes(toplevel, numbers, records) {
  const taken = new Set(Object.entries(records).filter(([number, record]) => !numbers.includes(Number(number)) && record.index !== undefined && fs.existsSync(record.slot)).map(([, record]) => record.index));
  const free = [];
  for (let index = 0; free.length < numbers.length; index += 1) if (!taken.has(index)) free.push(index);
  return free;
}

export function windowRecords(root) {
  return readJsonOrNull(windowFile(root)) ?? {};
}

export function restartRecord(root, number, record) {
  const known = windowRecords(root);
  const records = { ...known, [number]: { ...known[number], ...record } };
  fs.writeFileSync(windowFile(root), JSON.stringify(records));
  return records;
}

// why: a gitignored plan input exists only in the run checkout, so each slot gets a copy.
function copyInputs(toplevel, slot, inputs) {
  for (const input of inputs) {
    const from = path.join(toplevel, input);
    if (!fs.statSync(from, { throwIfNoEntry: false })?.isFile() || path.basename(input).startsWith('.env')) continue;
    if (git(toplevel, ['check-ignore', '-q', '--', input]).status !== 0) continue;
    fs.mkdirSync(path.dirname(path.join(slot, input)), { recursive: true });
    fs.copyFileSync(from, path.join(slot, input));
  }
}

function discard(toplevel, slots) {
  for (const slot of slots) {
    git(toplevel, ['worktree', 'remove', '--force', slot]);
    fs.rmSync(slot, { recursive: true, force: true });
  }
  git(toplevel, ['worktree', 'prune']);
}

function writeBaseline(toplevel, fresh) {
  fs.mkdirSync(path.dirname(baselineFile(toplevel)), { recursive: true });
  if (!fresh && fs.existsSync(baselineFile(toplevel))) return null;
  const status = git(toplevel, ['status', '--porcelain']);
  if (status.status !== 0) return { reason: `git status failed: ${status.stderr.trim()}` };
  fs.writeFileSync(baselineFile(toplevel), status.stdout);
  return null;
}

function writeSlotEnv(slot, variables) {
  fs.mkdirSync(variables.EXO_STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(slot, '.exo', 'slot.env'), `${Object.entries(variables).map(([name, value]) => `export ${name}=${JSON.stringify(value)}`).join('\n')}\n`);
}

function runSetup(slot, setup, variables) {
  if (setup === null || setup === 'none') return null;
  const ran = spawnSync(setup, { cwd: slot, shell: true, encoding: 'utf8', env: { ...process.env, ...variables } });
  if (ran.status === 0) return null;
  return { reason: `Worktree setup failed in ${slot}: ${`${ran.stdout}${ran.stderr}`.trim().split('\n').at(-1)}` };
}

function openSlot(toplevel, number, { setup, inputs, variables }, made) {
  const slot = slotOf(toplevel, number);
  const add = createWorktree(toplevel, slot, ['worktree', 'add', '--detach', slot, 'HEAD'], { env: false });
  if (!add.ok) return { reason: `git worktree add ${slot} failed: ${add.error}` };
  made.push(slot);
  fs.mkdirSync(path.join(slot, '.exo'), { recursive: true });
  copyInputs(toplevel, slot, inputs);
  writeSlotEnv(slot, variables);
  return runSetup(slot, setup, variables);
}

export function openSlots({ root, numbers, setup, inputs = [], fresh, since }) {
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return { reason: `${root} is no git checkout` };
  const toplevel = top.stdout.trim();
  const failed = writeBaseline(toplevel, fresh);
  if (failed) return failed;
  const head = git(toplevel, ['rev-parse', 'HEAD']);
  if (head.status !== 0) return { reason: `git rev-parse HEAD failed: ${head.stderr.trim()}` };
  const base = head.stdout.trim();
  const made = [];
  const records = fresh ? {} : windowRecords(toplevel);
  const indexes = freeIndexes(toplevel, numbers, records);
  const variables = numbers.map((number, position) => slotEnv(toplevel, indexes[position]));
  for (const [position, number] of numbers.entries()) {
    const problem = openSlot(toplevel, number, { setup, inputs, variables: variables[position] }, made);
    if (!problem) continue;
    discard(toplevel, made);
    return problem;
  }
  for (const [position, number] of numbers.entries()) records[number] = { slot: slotOf(toplevel, number), base, since, index: indexes[position], env: variables[position] };
  fs.writeFileSync(windowFile(toplevel), JSON.stringify(records));
  return { toplevel, base, baseline: baselineFile(toplevel), records };
}
