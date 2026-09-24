// Prints what the next build needs, read from the plan and the checkout's
// history instead of the session's memory: the landed set, the next task or
// wave, and for each of its tasks its Design: and Run: lines, the drift of its
// Modify: regions and the path of its brief. The brief, the frame fields and
// the section verbatim, goes to a file under the checkout's git directory, so
// the section reaches only the implementer and stays out of the session.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { driftOf, frameOf, landedTasks, nextWave, parsePlan, PlanError } from '#plan-tasks';

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

function taskBrief(task, frame) {
  return [
    `Goal: ${frame.goal}`,
    'Non-goals touching these paths:',
    ...bulletLines(bulletsFor(task, frame.nonGoals)),
    'Context for these paths and symbols:',
    ...bulletLines(bulletsFor(task, frame.context)),
    ...visualDirectionLines(task, frame),
    '',
    'The task section:',
    task.section,
    ''
  ].join('\n');
}

// The brief sits under the run checkout's git directory, which a wave's
// worktrees do not share, so a worktree never sees or commits it.
function writeBrief(task, frame, briefDirectory) {
  const briefPath = path.join(briefDirectory, `task-${task.number}.md`);
  fs.writeFileSync(briefPath, taskBrief(task, frame));
  return briefPath;
}

function taskLines(task, frame, root, briefDirectory) {
  const drift = driftOf(task, root);
  return [
    `Task ${task.number}: ${task.title}`,
    task.section.match(/^Design: .+$/m)?.[0] ?? 'Design: none',
    ...task.section.split('\n').filter((line) => line.startsWith('Run: ')),
    ...(drift.length === 0 ? ['Drift: none'] : drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`)),
    `Brief: ${writeBrief(task, frame, briefDirectory)}`
  ];
}

// Writes a brief file for each task of the next wave and returns the report
// that names them.
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
  const gitDirectory = execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  const briefDirectory = path.join(gitDirectory, 'exo', 'briefs');
  if (wave.length > 0) fs.mkdirSync(briefDirectory, { recursive: true });
  for (const task of wave) lines.push('', ...taskLines(task, frame, root, briefDirectory));
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
    } else if (error instanceof PlanError) {
      process.stderr.write(`next-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
