import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { defaultBranch } from '#git';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { planIdOf } from '#plan-landed';
import { readyTasks } from '#plan-waves';
import { UsageError } from '#script-flags';
import { SCRATCH_FOLDER } from '#scratch-path';
import { isFileOnDisk, resolveClaude } from './run-session-claude.mjs';
import { SCRIPT } from './run-session-paths.mjs';
import { gitOut } from './run-worktree.mjs';
import { ensureServices } from '../../../lib/services.mjs';
import { Refusal } from './run-plan-errors.mjs';

export const lastLine = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';

export function taskOrder(tasks, landed) {
  const done = [...landed];
  const order = [];
  for (;;) {
    const next = readyTasks(tasks, done)[0];
    if (next === undefined) return order;
    order.push(next.number);
    done.push(next.number);
  }
}

export function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function preflight(planArgument, flags) {
  const claude = resolveClaude({ flag: flags.claude });
  if (claude.refused !== undefined) throw new Refusal(claude.refused);
  const planPath = path.resolve(planArgument);
  if (!isFileOnDisk(planPath)) throw new Refusal(`no plan at ${planArgument}`);
  const root = gitOut(path.resolve(flags.root ?? '.'), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${flags.root ?? process.cwd()} is not inside a git repository`);
  let plan;
  try {
    plan = parsePlan(fs.readFileSync(planPath, 'utf8'));
  } catch (error) {
    throw new Refusal(`the plan does not parse: ${error.message}`);
  }
  const basis = frameOf(plan.frame);
  const branch = gitOut(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  const wanted = basis.branch?.trim() ?? null;
  if (wanted === null) throw new Refusal("the plan's '## Plan basis' names no Branch:");
  if (branch !== wanted) {
    const exists = gitOut(root, ['show-ref', '--verify', '--quiet', `refs/heads/${wanted}`]) !== null;
    throw new Refusal(`the checkout is on branch ${branch ?? '(detached)'}, not the plan's Branch: ${wanted}; run git switch ${exists ? '' : '-c '}${wanted}`);
  }
  if (wanted === defaultBranch(root)) throw new Refusal(`Branch: ${wanted} is the default branch`);
  const tracked = gitOut(root, ['status', '--porcelain', '--untracked-files=no'], { trim: false });
  if (tracked !== '') throw new Refusal(`tracked change in the checkout: ${tracked.split('\n')[0].slice(3)}; commit it first`);
  const passFile = path.join(root, SCRATCH_FOLDER, 'run-plan', planIdOf(planPath), 'plan-check-ok');
  const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const passKey = `${sha(planPath)} ${gitOut(root, ['rev-parse', 'HEAD'])} ${sha(SCRIPT.planCheck)}\n`;
  if (!(isFileOnDisk(passFile) && fs.readFileSync(passFile, 'utf8') === passKey)) {
    const check = spawnSync(process.execPath, [SCRIPT.planCheck, '--plan', planPath, '--root', root, '--loop', '--run'], { encoding: 'utf8' });
    if (check.status !== 0) {
      const lines = `${check.stdout}\n${check.stderr}`.split('\n').filter((line) => line.trim() !== '');
      throw new Refusal(`plan-check --loop fails: ${lines.find((line) => line.startsWith('loop: ')) ?? lines[0] ?? `exit ${check.status}`}`);
    }
    fs.mkdirSync(path.dirname(passFile), { recursive: true });
    fs.writeFileSync(passFile, passKey);
  }
  const services = ensureServices(root);
  if (services !== 'up') throw new Refusal(services);
  return { claude, planPath, root, plan, branch };
}

export function numberFlag(value, name, { integer = false } = {}) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new UsageError(`flag '--${name}' needs a positive ${integer ? 'integer' : 'number'}`);
  return number;
}
