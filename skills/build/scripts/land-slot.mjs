import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { landedTasks, parsePlan, PlanError, planIdOf } from '#plan-tasks';
import { landTask, LandingError } from './land-task.mjs';
import { nextTaskReport, refreshProgress, windowLines } from './next-task.mjs';
import { restartRecord } from './open-slots.mjs';
import { removeWorktree, RemoveWorktreeError } from './remove-worktree.mjs';

const statusOf = (directory) => execFileSync('git', ['-C', directory, 'status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter(Boolean);

const refusal = (word, number, detail) => `${word} ${number}: ${detail}\nStart: none\n`;

function conflictOf(root, sha) {
  const pick = spawnSync('git', ['-C', root, 'cherry-pick', sha], { encoding: 'utf8' });
  if (pick.status === 0) return null;
  const output = `${pick.stdout}${pick.stderr}`.trim();
  const abort = spawnSync('git', ['-C', root, 'cherry-pick', '--abort'], { encoding: 'utf8' });
  const aborted = abort.status === 0 ? 'was aborted' : `abort failed, check ${root} for a half-applied pick: ${`${abort.stdout}${abort.stderr}`.trim().split('\n')[0]}`;
  return { output, aborted };
}

function removeSlot({ slot, root, base, number }) {
  const patch = path.join(slot, '.exo', `task-${number}.patch`);
  try {
    execFileSync('git', ['-C', slot, 'add', '-A'], { encoding: 'utf8' });
    fs.writeFileSync(patch, execFileSync('git', ['-C', slot, 'diff', '--cached', base], { encoding: 'utf8' }));
    return removeWorktree({ worktree: slot, run: root, report: path.join(slot, '.exo', `implementer-${number}.md`) });
  } catch (error) {
    if (error instanceof RemoveWorktreeError || error.status !== undefined) return `slot ${slot} kept: ${error.message.split('\n')[0]}\n`;
    throw error;
  }
}

// why: the rebuild rewrites the slot's report, so its wait counts only a report written after this refusal.
function rebuildLines({ planPath, number, root, slot, base, inFlight, unlanded, chained }) {
  const records = restartRecord(root, number, { slot, base, since: Math.floor(Date.now() / 1000) });
  if (chained) return '';
  return `${windowLines({ planPath, root, records, running: [number, ...inFlight.filter((other) => other !== number)], unlanded }).join('\n')}\n`;
}

// why: --chained marks a `Land all:` command before the last; the last one prints the next step for the whole chain.
export function landSlot({ planPath, number, root, slot, base, baseline, inFlight: named = [], chained = false }) {
  const known = fs.readFileSync(baseline, 'utf8').split('\n');
  const fresh = statusOf(root).filter((line) => !known.includes(line));
  if (fresh.length > 0) return refusal('NEWPATH', number, `the run's checkout gained ${fresh.map((line) => line.slice(3)).join(', ')}; slot ${slot} kept, nothing landed`);
  const planText = fs.readFileSync(planPath, 'utf8');
  const tasks = parsePlan(planText).tasks;
  const landedBefore = landedTasks(tasks, root, planIdOf(planPath));
  const inFlight = named.filter((other) => !landedBefore.includes(other));
  const unlanded = tasks.map((task) => task.number).filter((other) => !landedBefore.includes(other));
  const reportPath = path.join(slot, '.exo', `implementer-${number}.md`);
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  let landed;
  try {
    landed = landTask({ planText, number, root: slot, reportText, reportPath, planPath });
  } catch (error) {
    if (error instanceof LandingError || error instanceof PlanError) return `${refusal('REFUSED', number, `${error.message}\nslot ${slot} kept`)}${rebuildLines({ planPath, number, root, slot, base, inFlight, unlanded, chained })}`;
    throw error;
  }
  const sha = execFileSync('git', ['-C', slot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const conflict = conflictOf(root, sha);
  if (conflict !== null) return refusal('CONFLICT', number, `cherry-pick of ${sha} failed and ${conflict.aborted}; slot ${slot} kept\n${conflict.output}`);
  const kept = landed.split('\n').filter((line) => !line.startsWith('Then: ')).join('\n');
  return `LANDED ${number} ${sha}\n${kept}${removeSlot({ slot, root, base, number })}${chained ? '' : nextTaskReport({ planPath, planText, root, inFlight, open: true })}`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', slot: 'value', base: 'value', baseline: 'value', 'in-flight': 'value', chained: 'boolean' });
  for (const name of ['plan', 'root', 'slot', 'base', 'baseline']) {
    if (flags[name] === undefined) throw new UsageError(`flag '--${name}' is required`);
  }
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  for (const name of ['plan', 'baseline']) {
    if (!fs.existsSync(flags[name])) throw new UsageError(`no file at '${flags[name]}'`);
  }
  const inFlight = (flags['in-flight'] ?? '').split(',').filter(Boolean).map(Number);
  if (inFlight.some((number) => !Number.isInteger(number))) throw new UsageError("flag '--in-flight' names task numbers, comma separated");
  process.stdout.write(landSlot({ planPath: flags.plan, number: Number(flags.task), root: flags.root, slot: flags.slot, base: flags.base, baseline: flags.baseline, inFlight, chained: flags.chained === true }));
  refreshProgress({ planPath: flags.plan, planText: fs.readFileSync(flags.plan, 'utf8'), root: flags.root });
}

function refuseUsage(error) {
  if (!(error instanceof UsageError)) throw error;
  process.stderr.write(`land-slot: ${error.message}\n`);
  process.exitCode = 2;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    refuseUsage(error);
  }
}
