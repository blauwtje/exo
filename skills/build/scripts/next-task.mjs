import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { forCaller } from '#script-output';
import { proofsReport } from '#proofs-report';
import { readBuildProgress, refreshBuildProgress, removeBuildProgress } from '#build-progress';
import { landedTasks, planIdOf } from '#plan-landed';
import { parsePlan, PlanError } from '#plan-tasks';
import { frameOnlyReport } from './next-task-brief.mjs';
import { chainedForCaller } from './next-task-caller.mjs';
import { nextTaskReport } from './next-task-report.mjs';
import { blockReport } from './next-task-block.mjs';

// why: the status line reads this record; a failure here must never fail the calling script.
export function refreshProgress({ planPath, planText, root }) {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId || process.env.EXO_RUN_TASK) return;
  try {
    const record = readBuildProgress(sessionId);
    if (record === null || record.plan !== path.resolve(planPath)) return;
    const { tasks } = parsePlan(planText);
    const landed = landedTasks(tasks, record.checkout ?? root, planIdOf(planPath)).length;
    refreshBuildProgress({ sessionId, plan: record.plan, landed, total: tasks.length });
    if (landed >= tasks.length) removeBuildProgress(sessionId);
  } catch {
    return;
  }
}

const USAGE = [
  'usage: next-task.mjs --plan <file> [--root <checkout>] [--frame | --block | --proofs]',
  '  [--open-slots] [--in-flight <n,n,...>] [--only <n,n,...>]',
  'Prints the next unlanded task of the plan, or the report the chosen flag names; exit 0 ok, 2 bad argument.',
  '--only limits waves and Start: refills to the named task numbers, the Block: line of the lead.',
].join('\n');

export function taskNumbers(text, flag) {
  if (text === undefined) return null;
  const numbers = text.split(',').filter(Boolean).map(Number);
  if (numbers.some((number) => !Number.isInteger(number))) throw new UsageError(`flag '--${flag}' names task numbers, comma separated`);
  return numbers;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', frame: 'boolean', block: 'boolean', proofs: 'boolean', 'open-slots': 'boolean', 'in-flight': 'value', only: 'value' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (flags.frame) {
    process.stdout.write(frameOnlyReport(planText));
    return;
  }
  let report = nextTaskReport;
  if (flags.block) report = blockReport;
  if (flags.proofs) report = proofsReport;
  const inFlight = taskNumbers(flags['in-flight'], 'in-flight') ?? [];
  const only = taskNumbers(flags.only, 'only');
  const root = flags.root ?? process.cwd();
  const open = flags['open-slots'] === true;
  const output = report({ planPath: flags.plan, planText, root, inFlight, only, open });
  process.stdout.write(open && report === nextTaskReport ? forCaller({ root, name: `next-task-${Date.now()}`, full: output, shown: chainedForCaller(output) }) : output);
  refreshProgress({ planPath: flags.plan, planText, root });
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`next-task: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof PlanError) {
      process.stderr.write(`next-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
