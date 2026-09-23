// Prints what the next build needs, read from the plan and the checkout's
// history instead of the session's memory: the landed set, the next task or
// wave, and for each of its tasks the frame fields the implementer brief
// takes, the drift of its Modify: regions and its section verbatim.

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { driftOf, frameOf, landedTasks, nextWave, parsePlan } from './plan-tasks.mjs';

function waveLine(wave) {
  if (wave.length === 0) return 'Next: none, every task landed';
  if (wave.length === 1) return `Next: Task ${wave[0].number}`;
  return `Wave: ${wave.map((task) => `Task ${task.number}`).join(', ')}`;
}

// The Non-goals and Context bullets that name one of the task's paths or
// regions; with no match, every bullet, because a brief that drops a fact
// turns it into a guess.
function bulletsFor(task, bullets) {
  const names = task.files.flatMap((file) => [file.path, file.region]).filter((name) => name !== null);
  const named = bullets.filter((bullet) => names.some((name) => bullet.includes(name)));
  return named.length === 0 ? bullets : named;
}

function bulletLines(bullets) {
  return bullets.length === 0 ? ['- none'] : bullets.map((bullet) => `- ${bullet}`);
}

function visualDirectionLines(task, frame) {
  if (!task.design || frame.visualDirection === null) return ['Visual direction: none'];
  return ['Visual direction:', frame.visualDirection];
}

function taskBrief(task, frame, drift) {
  return [
    `### Brief for Task ${task.number}`,
    `Goal: ${frame.goal}`,
    'Non-goals touching these paths:',
    ...bulletLines(bulletsFor(task, frame.nonGoals)),
    'Context for these paths and symbols:',
    ...bulletLines(bulletsFor(task, frame.context)),
    ...visualDirectionLines(task, frame),
    ...(drift.length === 0 ? ['Drift: none'] : drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`)),
    'The task section:',
    task.section
  ];
}

export function nextTaskReport({ planPath, planText, root }) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError(`${planPath} holds no '### Task <n>:' heading`);
  const frame = frameOf(plan.frame);
  const landed = landedTasks(plan.tasks, root);
  const wave = nextWave(plan.tasks, landed, frame.worktreeSetup);
  const lines = [
    `Plan: ${planPath}`,
    `Repository: ${frame.repository ?? 'none'}`,
    `Branch: ${frame.branch ?? 'none'}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    waveLine(wave)
  ];
  for (const task of wave) lines.push('', ...taskBrief(task, frame, driftOf(task, root)));
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  process.stdout.write(nextTaskReport({ planPath: flags.plan, planText, root: flags.root ?? process.cwd() }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`next-task: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
